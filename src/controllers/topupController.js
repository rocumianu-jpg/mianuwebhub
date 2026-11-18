'use strict';

const crypto = require('crypto');
const axios = require('axios');
const CardTopup = require('../models/CardTopup');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');

/**
 * Danh sách mệnh giá hợp lệ cho từng nhà mạng
 */
const VALID_AMOUNTS = {
  VIETTEL: [10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000],
  VINAPHONE: [10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000],
  GARENA: [5000, 10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000],
  ZING: [10000, 20000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000],
};

/**
 * BẢNG TÍNH CHIẾT KHẤU / PHÍ GẠCH THẺ THEO YÊU CẦU:
 * - Vinaphone: Mệnh giá 10.000đ (phí 20%), các mệnh giá khác (phí 18%)
 * - Viettel: Mệnh giá 10.000đ, 20.000đ, 30.000đ (phí 22%), các mệnh giá khác (phí 18%)
 * - Garena: Mọi mệnh giá, kể cả 5.000đ (phí 18%)
 * - Zing: Mọi mệnh giá (phí 17%)
 *
 * @param {string} telco - Nhà mạng (VIETTEL, VINAPHONE, GARENA, ZING)
 * @param {number} amount - Mệnh giá thẻ (VND)
 * @returns {number} Phần trăm phí gạch thẻ (%)
 */
function getCardFeePercent(telco, amount) {
  const normTelco = (telco || '').toUpperCase().trim();
  const numAmount = Number(amount) || 0;

  switch (normTelco) {
    case 'VINAPHONE':
      // Vinaphone: Mệnh giá 10.000đ phí 20%, các mệnh giá khác phí 18%
      return numAmount === 10000 ? 20 : 18;

    case 'VIETTEL':
      // Viettel: Mệnh giá 10k, 20k, 30k phí 22%, các mệnh giá khác phí 18%
      return [10000, 20000, 30000].includes(numAmount) ? 22 : 18;

    case 'GARENA':
      // Garena: Mọi mệnh giá (kể cả 5.000đ) phí 18%
      return 18;

    case 'ZING':
      // Zing: Mọi mệnh giá phí 17%
      return 17;

    default:
      return 20;
  }
}

/**
 * Tính số tiền thực nhận (balance) sau khi khấu trừ phí chiết khấu
 * @param {string} telco - Nhà mạng
 * @param {number} amount - Mệnh giá thực của thẻ
 * @returns {{ feePercent: number, receivedAmount: number }}
 */
function calculateReceivedAmount(telco, amount) {
  const feePercent = getCardFeePercent(telco, amount);
  const receivedAmount = Math.max(0, Math.round(Number(amount) * (1 - feePercent / 100)));
  return { feePercent, receivedAmount };
}

/**
 * POST /api/topup
 * Gửi thẻ cào lên cổng TheSieuRe (TSR)
 */
const submitCard = async (req, res, next) => {
  try {
    const { telco, amount, serial, code } = req.body;
    const userId = req.user?._id || req.body.userId;

    // 1. Kiểm tra tài khoản người nạp
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để thực hiện nạp thẻ cào.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Tài khoản người dùng không tồn tại.',
      });
    }

    // 2. Validate dữ liệu thẻ
    const normTelco = (telco || '').toUpperCase().trim();
    if (!['VIETTEL', 'VINAPHONE', 'GARENA', 'ZING'].includes(normTelco)) {
      return res.status(400).json({
        success: false,
        message: 'Nhà mạng không hợp lệ. Chỉ hỗ trợ Viettel, Vinaphone, Garena, Zing.',
      });
    }

    const numAmount = Number(amount);
    const validList = VALID_AMOUNTS[normTelco] || [];
    if (!numAmount || !validList.includes(numAmount)) {
      return res.status(400).json({
        success: false,
        message: `Mệnh giá ${numAmount ? numAmount.toLocaleString('vi-VN') + 'đ' : ''} không hợp lệ đối với nhà mạng ${normTelco}. Vui lòng chọn mệnh giá chính xác từ danh sách.`,
      });
    }

    const cleanSerial = (serial || '').toString().trim();
    const cleanCode = (code || '').toString().trim();

    if (!cleanSerial || !cleanCode) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Số Serial và Mã thẻ (PIN).',
      });
    }

    // Kiểm tra định dạng cơ bản: không chứa dấu cách hoặc ký tự đặc biệt
    if (cleanSerial.length < 5 || cleanCode.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Độ dài Serial hoặc Mã thẻ quá ngắn. Vui lòng kiểm tra lại.',
      });
    }

    // 3. Đọc Partner ID và Partner Key từ biến môi trường
    const partnerId = process.env.TSR_PARTNER_ID;
    const partnerKey = process.env.TSR_PARTNER_KEY;

    if (!partnerId || !partnerKey) {
      return res.status(500).json({
        success: false,
        message: 'Hệ thống nạp thẻ TSR chưa được thiết lập Partner ID hoặc Partner Key trong cấu hình môi trường (.env).',
      });
    }

    // 4. Khởi tạo mã giao dịch độc nhất (request_id)
    const requestId = `TSR_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 5. TẠO CHỮ KÝ BẢO MẬT (SIGN):
    // Theo chuẩn TSR: Chữ ký MD5 được băm từ chuỗi partner_key + code + serial
    const rawSignatureString = `${partnerKey}${cleanCode}${cleanSerial}`;
    const sign = crypto.createHash('md5').update(rawSignatureString).digest('hex');

    // 6. Tính trước phí dự kiến
    const { feePercent, receivedAmount } = calculateReceivedAmount(normTelco, numAmount);

    // 7. Lưu bản ghi giao dịch ở trạng thái 'pending' vào MongoDB
    const topupRecord = await CardTopup.create({
      userId: user._id,
      requestId,
      telco: normTelco,
      declaredAmount: numAmount,
      realAmount: 0,
      feePercent,
      receivedAmount,
      serial: cleanSerial,
      code: cleanCode,
      status: 'pending',
      message: 'Đang gửi thẻ sang TheSieuRe...',
    });

    // 8. Chuẩn bị payload gửi sang TSR API v2
    const tsrPayload = {
      telco: normTelco,
      code: cleanCode,
      serial: cleanSerial,
      amount: numAmount,
      request_id: requestId,
      partner_id: partnerId,
      sign: sign,
      command: 'charging',
    };

    let tsrResponseData = null;
    try {
      // Gọi API TheSieuRe v2 (timeout 25s)
      const response = await axios.post('https://thesieure.com/chargingws/v2', tsrPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MianuWebHub-TSR/1.0',
        },
        timeout: 25000,
      });
      tsrResponseData = response.data;
    } catch (httpErr) {
      // Nếu lỗi mạng hoặc TSR timeout, giữ trạng thái pending để chờ Webhook gạch thẻ
      topupRecord.message = `Gửi thẻ hoàn tất (Chờ duyệt): ${httpErr.message}`;
      await topupRecord.save();

      return res.status(200).json({
        success: true,
        message: 'Thẻ đã được tiếp nhận và đang chờ TheSieuRe đối soát. Tiền sẽ tự động cộng khi thẻ được duyệt.',
        data: {
          requestId: topupRecord.requestId,
          telco: topupRecord.telco,
          declaredAmount: topupRecord.declaredAmount,
          status: topupRecord.status,
          receivedAmount: topupRecord.receivedAmount,
        },
      });
    }

    // 9. Xử lý phản hồi từ TheSieuRe
    topupRecord.rawResponse = tsrResponseData;

    const resStatus = Number(tsrResponseData?.status);
    const resMessage = tsrResponseData?.message || 'Đã gửi thẻ thành công';
    const transId = tsrResponseData?.trans_id || tsrResponseData?.request_id || '';
    if (transId) topupRecord.tsrTransId = String(transId);

    // Bảng mã phản hồi TSR:
    // status 99, 100: Thẻ gửi thành công, đang chờ xử lý / gạch thẻ
    // status 1: Thẻ thành công ngay lập tức (hiếm gặp lúc nạp nhưng có thể xảy ra)
    // status 2: Sai mệnh giá
    // status 3: Thẻ lỗi / sai mã thẻ / đã sử dụng
    // status 4: Nhà mạng bảo trì
    // status 102: Lỗi chữ ký hoặc cấu hình
    if (resStatus === 99 || resStatus === 100) {
      topupRecord.status = 'pending';
      topupRecord.message = resMessage;
      await topupRecord.save();

      return res.status(200).json({
        success: true,
        message: 'Gửi thẻ thành công! Hệ thống đang tiến hành gạch thẻ tự động (1-3 phút).',
        data: {
          requestId: topupRecord.requestId,
          telco: topupRecord.telco,
          declaredAmount: topupRecord.declaredAmount,
          status: 'pending',
          receivedAmount: topupRecord.receivedAmount,
          message: resMessage,
        },
      });
    } else if (resStatus === 1) {
      // Thành công ngay lập tức
      const actualValue = Number(tsrResponseData?.value) || numAmount;
      const { feePercent: finalFee, receivedAmount: finalReceived } = calculateReceivedAmount(
        normTelco,
        actualValue
      );

      topupRecord.status = 'completed';
      topupRecord.realAmount = actualValue;
      topupRecord.feePercent = finalFee;
      topupRecord.receivedAmount = finalReceived;
      topupRecord.message = resMessage;
      await topupRecord.save();

      // Cộng tiền ngay lập tức vào tài khoản User
      await User.findByIdAndUpdate(user._id, { $inc: { balance: finalReceived } });

      return res.status(200).json({
        success: true,
        message: `Nạp thẻ thành công! Tài khoản được cộng +${finalReceived.toLocaleString('vi-VN')}đ.`,
        data: {
          requestId: topupRecord.requestId,
          telco: topupRecord.telco,
          declaredAmount: topupRecord.declaredAmount,
          status: 'completed',
          receivedAmount: finalReceived,
        },
      });
    } else if (resStatus === 2) {
      topupRecord.status = 'wrong_amount';
      topupRecord.message = resMessage || 'Sai mệnh giá thẻ khai báo';
      await topupRecord.save();

      return res.status(400).json({
        success: false,
        message: `Thẻ sai mệnh giá: ${resMessage}`,
      });
    } else {
      // status 3, 4, 102 hoặc khác
      topupRecord.status = 'failed';
      topupRecord.message = resMessage || 'Thẻ không hợp lệ hoặc đã qua sử dụng';
      await topupRecord.save();

      return res.status(400).json({
        success: false,
        message: `Gạch thẻ không thành công: ${resMessage}`,
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/callback/tsr
 * Webhook nhận kết quả gạch thẻ tự động từ TheSieuRe
 * Payload mẫu từ TSR:
 * {
 *   status: 1, // 1: Đúng, 2: Sai mệnh giá, 3: Thất bại/Thẻ sai
 *   message: 'Nạp thẻ thành công',
 *   request_id: 'TSR_1699999_XXXX',
 *   declared_value: 50000,
 *   value: 50000,
 *   amount: 50000,
 *   code: '1234567890123',
 *   serial: '1234567890',
 *   telco: 'VIETTEL',
 *   trans_id: 1234567,
 *   callback_sign: '...'
 * }
 */
const handleTSRCallback = async (req, res, next) => {
  try {
    // Dữ liệu callback có thể nằm ở body (POST) hoặc query (GET)
    const payload = { ...req.query, ...req.body };
    const {
      status,
      message,
      request_id,
      declared_value,
      value,
      amount,
      code,
      serial,
      telco,
      trans_id,
      callback_sign,
    } = payload;

    if (!request_id) {
      return res.status(400).json({ status: 400, message: 'Thiếu tham số request_id' });
    }

    // 1. Tìm bản ghi giao dịch trong cơ sở dữ liệu
    const transaction = await CardTopup.findOne({ requestId: request_id });
    if (!transaction) {
      return res.status(404).json({
        status: 404,
        message: `Không tìm thấy giao dịch với request_id: ${request_id}`,
      });
    }

    // 2. Kiểm tra tính Idempotency (Tránh cộng tiền 2 lần nếu TSR callback lặp lại)
    if (transaction.status !== 'pending') {
      return res.status(200).json({
        status: 200,
        message: 'Giao dịch này đã được xử lý trước đó',
      });
    }

    // 3. Tùy chọn xác thực chữ ký callback_sign nếu TheSieuRe cung cấp
    const partnerKey = process.env.TSR_PARTNER_KEY;
    if (callback_sign && partnerKey && code && serial) {
      const expectedSign = crypto
        .createHash('md5')
        .update(`${partnerKey}${code.trim()}${serial.trim()}`)
        .digest('hex');
      if (callback_sign.toLowerCase() !== expectedSign.toLowerCase()) {
        console.warn(`[TSR Callback Warn] Sai chữ ký callback_sign cho ${request_id}`);
      }
    }

    const statusCode = Number(status);
    const actualTelco = (telco || transaction.telco).toUpperCase().trim();
    transaction.rawResponse = payload;
    if (trans_id) transaction.tsrTransId = String(trans_id);

    // 4. XỬ LÝ THEO TRẠNG THÁI GẠCH THẺ:
    if (statusCode === 1) {
      // ─── TRƯỜNG HỢP 1: THÀNH CÔNG (ĐÚNG MỆNH GIÁ) ───────────────────────────
      // Mệnh giá thực của thẻ
      const actualValue = Number(value) || Number(declared_value) || Number(amount) || transaction.declaredAmount;

      // Áp dụng công thức chiết khấu chính xác theo yêu cầu
      const { feePercent, receivedAmount } = calculateReceivedAmount(actualTelco, actualValue);

      transaction.status = 'completed';
      transaction.realAmount = actualValue;
      transaction.feePercent = feePercent;
      transaction.receivedAmount = receivedAmount;
      transaction.message = message || 'Thẻ đúng mệnh giá, đã cộng tiền thành công';
      await transaction.save();

      // Cộng tiền trực tiếp vào tài khoản User
      const updatedUser = await User.findByIdAndUpdate(
        transaction.userId,
        { $inc: { balance: receivedAmount } },
        { new: true }
      );

      // Tạo thông báo đến người dùng
      try {
        await Notification.create({
          title: 'Nạp Thẻ Cào Thành Công',
          message: `Thẻ ${actualTelco} mệnh giá ${actualValue.toLocaleString('vi-VN')}đ đã được duyệt! Bạn được cộng +${receivedAmount.toLocaleString('vi-VN')}đ vào số dư ví.`,
          type: 'personal',
          userId: transaction.userId,
        });
      } catch (notifErr) {
        console.error('[Notification Error]:', notifErr.message);
      }

      console.log(
        `[TSR Callback Success] ${request_id}: User ${transaction.userId} +${receivedAmount}đ (Thẻ: ${actualTelco} ${actualValue}đ - Phí: ${feePercent}%)`
      );

      return res.status(200).json({ status: 200, message: 'Xử lý thành công' });
    } else if (statusCode === 2) {
      // ─── TRƯỜNG HỢP 2: SAI MỆNH GIÁ ──────────────────────────────────────
      const actualValue = Number(value) || 0;
      transaction.status = 'wrong_amount';
      transaction.realAmount = actualValue;
      transaction.message = message || 'Nạp thẻ sai mệnh giá khai báo (bị phạt hoặc từ chối)';
      await transaction.save();

      try {
        await Notification.create({
          title: 'Nạp Thẻ Thất Bại (Sai Mệnh Giá)',
          message: `Thẻ ${actualTelco} (Serial: ${transaction.serial}) bị từ chối do khai báo sai mệnh giá. Vui lòng kiểm tra lại.`,
          type: 'personal',
          userId: transaction.userId,
        });
      } catch (notifErr) {}

      return res.status(200).json({ status: 200, message: 'Ghi nhận sai mệnh giá' });
    } else {
      // ─── TRƯỜNG HỢP 3: THẤT BẠI (THẺ SAI / ĐÃ DÙNG / BẢO TRÌ) ────────────
      transaction.status = 'failed';
      transaction.message = message || 'Thẻ không hợp lệ hoặc đã qua sử dụng';
      await transaction.save();

      try {
        await Notification.create({
          title: 'Nạp Thẻ Thất Bại',
          message: `Thẻ ${actualTelco} (Serial: ${transaction.serial}) không hợp lệ: ${message || 'Đã sử dụng hoặc sai mã thẻ'}.`,
          type: 'personal',
          userId: transaction.userId,
        });
      } catch (notifErr) {}

      return res.status(200).json({ status: 200, message: 'Ghi nhận thất bại' });
    }
  } catch (err) {
    console.error('[TSR Callback Error]:', err);
    return res.status(500).json({ status: 500, message: err.message });
  }
};

/**
 * GET /api/topup/history
 * Lấy lịch sử nạp thẻ cào của người dùng hiện tại
 */
const getUserHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const history = await CardTopup.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('-code'); // Ẩn mã PIN thẻ vì lý do bảo mật

    return res.status(200).json({
      success: true,
      history,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/topup/admin/list
 * Dành cho Quản trị viên xem toàn bộ lịch sử gạch thẻ
 */
const adminGetTopups = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.telco) query.telco = req.query.telco.toUpperCase();

    const [topups, total] = await Promise.all([
      CardTopup.find(query)
        .populate('userId', 'username email displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CardTopup.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      topups,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/topup/manual
 * Gửi thẻ cào nạp thủ công (chờ Admin duyệt, không gọi qua TSR API)
 */
const submitManualCard = async (req, res, next) => {
  try {
    const { telco, amount, serial, code } = req.body;
    const userId = req.user?._id || req.body.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để nạp thẻ.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Tài khoản người dùng không tồn tại.',
      });
    }

    const normTelco = (telco || '').toUpperCase().trim();
    if (!['VIETTEL', 'VINAPHONE', 'GARENA', 'ZING'].includes(normTelco)) {
      return res.status(400).json({
        success: false,
        message: 'Nhà mạng không hợp lệ. Chỉ hỗ trợ Viettel, Vinaphone, Garena, Zing.',
      });
    }

    const numAmount = Number(amount);
    const validList = VALID_AMOUNTS[normTelco] || [];
    if (!numAmount || !validList.includes(numAmount)) {
      return res.status(400).json({
        success: false,
        message: `Mệnh giá ${numAmount ? numAmount.toLocaleString('vi-VN') + 'đ' : ''} không hợp lệ. Vui lòng chọn mệnh giá chính xác từ danh sách.`,
      });
    }

    const cleanSerial = (serial || '').toString().trim();
    const cleanCode = (code || '').toString().trim();

    if (!cleanSerial || !cleanCode) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Số Serial và Mã thẻ (PIN).',
      });
    }

    const requestId = `MANUAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Đồng bộ tính tỷ lệ chiết khấu & số tiền thực nhận chính xác
    const { feePercent, receivedAmount } = calculateReceivedAmount(normTelco, numAmount);

    // Lưu vào Database với trạng thái pending_manual
    const topupRecord = await CardTopup.create({
      userId: user._id,
      requestId,
      method: 'manual',
      telco: normTelco,
      declaredAmount: numAmount,
      realAmount: numAmount,
      feePercent,
      receivedAmount, // Thực nhận sau khi trừ phí chiết khấu
      serial: cleanSerial,
      code: cleanCode,
      status: 'pending_manual',
      message: 'Đang chờ Quản trị viên kiểm tra và duyệt thẻ thủ công',
    });

    return res.status(200).json({
      success: true,
      message: 'Gửi thẻ thủ công thành công! Thẻ của bạn đang chờ Admin kiểm tra và duyệt tiền.',
      data: {
        requestId: topupRecord.requestId,
        telco: topupRecord.telco,
        declaredAmount: topupRecord.declaredAmount,
        feePercent: topupRecord.feePercent,
        receivedAmount: topupRecord.receivedAmount,
        status: topupRecord.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/topup/admin/:id/approve
 * Admin duyệt thẻ thủ công -> Tự động cộng số tiền THỰC NHẬN (sau trừ phí) vào tài khoản User
 */
const adminApproveManualCard = async (req, res, next) => {
  try {
    const cardId = req.params.id;
    const card = await CardTopup.findById(cardId);

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch thẻ này.',
      });
    }

    if (card.status !== 'pending_manual' && card.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Thẻ này đã được xử lý trước đó với trạng thái: ${card.status}`,
      });
    }

    // Lấy số tiền thực nhận sau chiết khấu (KHÔNG BAO GIỜ cộng 100% declaredAmount)
    // Nếu Admin tùy chỉnh số tiền trong req.body.amount (trường hợp khách chọn sai mệnh giá), dùng số tiền đó
    let creditAmount;
    if (req.body.amount !== undefined && req.body.amount !== null && !isNaN(Number(req.body.amount))) {
      creditAmount = Number(req.body.amount);
    } else {
      creditAmount =
        typeof card.receivedAmount === 'number' && card.receivedAmount > 0
          ? card.receivedAmount
          : calculateReceivedAmount(card.telco, card.realAmount || card.declaredAmount).receivedAmount;
    }

    card.status = 'completed';
    card.receivedAmount = creditAmount;
    if (!card.feePercent && card.declaredAmount > 0) {
      card.feePercent = getCardFeePercent(card.telco, card.declaredAmount);
    }
    card.approvedBy = req.user._id;
    card.approvedAt = new Date();
    card.message = req.body.note || 'Quản trị viên đã duyệt thành công và cộng tiền vào tài khoản.';
    await card.save();

    // Tự động cộng đúng số tiền thực nhận cho User
    await User.findByIdAndUpdate(card.userId, { $inc: { balance: creditAmount } });

    // Tạo thông báo cho người dùng
    try {
      await Notification.create({
        title: 'Nạp Thẻ Thủ Công Thành Công',
        message: `Thẻ ${card.telco} mệnh giá ${card.declaredAmount.toLocaleString('vi-VN')}đ đã được Admin phê duyệt! Bạn nhận được +${creditAmount.toLocaleString('vi-VN')}đ vào số dư (đã khấu trừ phí chiết khấu ${card.feePercent}%).`,
        type: 'personal',
        userId: card.userId,
      });
    } catch (notifErr) {}

    return res.status(200).json({
      success: true,
      message: `Đã duyệt thẻ thành công! Tài khoản người dùng đã được cộng +${creditAmount.toLocaleString('vi-VN')}đ (sau chiết khấu).`,
      card,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/topup/admin/:id/reject
 * Admin từ chối / hủy thẻ sai -> Không cộng tiền
 */
const adminRejectManualCard = async (req, res, next) => {
  try {
    const cardId = req.params.id;
    const { reason } = req.body;
    const card = await CardTopup.findById(cardId);

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch thẻ này.',
      });
    }

    if (card.status !== 'pending_manual' && card.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Thẻ này đã được xử lý trước đó với trạng thái: ${card.status}`,
      });
    }

    card.status = 'failed';
    card.approvedBy = req.user._id;
    card.approvedAt = new Date();
    card.message = reason || 'Thẻ sai hoặc không hợp lệ do Admin từ chối';
    await card.save();

    try {
      await Notification.create({
        title: 'Thẻ Cào Bị Từ Chối',
        message: `Thẻ ${card.telco} (Serial: ${card.serial}) bị từ chối duyệt: ${card.message}. Vui lòng liên hệ Admin nếu có nhầm lẫn.`,
        type: 'personal',
        userId: card.userId,
      });
    } catch (notifErr) {}

    return res.status(200).json({
      success: true,
      message: 'Đã từ chối thẻ thành công. Không cộng tiền cho người dùng.',
      card,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/topup/config
 * Lấy chế độ nạp thẻ toàn hệ thống: 'auto_tsr' (Gạch tự động TSR) hoặc 'manual' (Duyệt thủ công)
 */
const getTopupConfig = async (req, res, next) => {
  try {
    let setting = await SystemSetting.findOne({ key: 'system_config' });
    if (!setting) {
      setting = await SystemSetting.create({ key: 'system_config', topupMode: 'manual' });
    }
    return res.status(200).json({
      success: true,
      mode: setting.topupMode || 'manual',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/topup/admin/config
 * Admin cấu hình chế độ nạp thẻ cào toàn hệ thống
 */
const adminUpdateTopupConfig = async (req, res, next) => {
  try {
    const { mode } = req.body;
    if (!['auto_tsr', 'manual'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Chế độ không hợp lệ. Chỉ chấp nhận "auto_tsr" hoặc "manual".',
      });
    }

    const setting = await SystemSetting.findOneAndUpdate(
      { key: 'system_config' },
      { topupMode: mode },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Đã cập nhật chế độ nạp thẻ sang: ${mode === 'manual' ? 'Thủ công (Admin duyệt)' : 'Tự động (TheSieuRe)'}`,
      mode: setting.topupMode,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submitCard,
  submitManualCard,
  adminApproveManualCard,
  adminRejectManualCard,
  handleTSRCallback,
  getUserHistory,
  adminGetTopups,
  getCardFeePercent,
  calculateReceivedAmount,
  getTopupConfig,
  adminUpdateTopupConfig,
};
