'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const geminiQueue = require('../services/geminiQueue');

/**
 * POST /api/gemini/start
 * Nhận gmail, trừ tiền ví, đưa vào Hàng Đợi (Queue) hoặc bắt đầu phiên nếu bot rảnh
 */
const startGemini = async (req, res, next) => {
  try {
    const { gmail, productId } = req.body;
    const userId = req.user._id;

    if (!gmail || !gmail.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp địa chỉ Gmail hợp lệ.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gmail.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Địa chỉ Gmail không đúng định dạng.',
      });
    }

    // Lấy thông tin giá tiền của gói Gemini
    let product = null;
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    if (!product) {
      product = await Product.findOne({ title: /gemini/i });
    }

    const price = product ? product.price : 5000;
    const productTitle = product ? product.title : 'Gemini Plus 1 Năm (Tự động)';

    // Kiểm tra số dư người dùng
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    if (user.balance < price) {
      return res.status(400).json({
        success: false,
        message: `Số dư ví không đủ. Giá dịch vụ: ${price.toLocaleString('vi-VN')} đ, số dư hiện có: ${user.balance.toLocaleString('vi-VN')} đ. Vui lòng nạp thêm tiền.`,
      });
    }

    // Trừ tiền số dư ví của user trước
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: price } },
      { $inc: { balance: -price } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'Trừ tiền số dư thất bại. Vui lòng thử lại.',
      });
    }

    // Tạo bản ghi đơn hàng ở trạng thái Chờ xử lý (pending)
    const order = await Order.create({
      userId,
      productId: product ? product._id : new mongoose.Types.ObjectId(),
      productTitle,
      pricePaid: price,
      secretLink: '',
      status: 'pending',
      customerNote: `Gmail: ${gmail.trim()}`,
      cancelNote: `Đang kết nối bot Telegram kích hoạt cho ${gmail.trim()}`,
      refunded: false,
    });

    try {
      // Đưa vào Queue hoặc bắt đầu ngay lập tức
      const queueResult = await geminiQueue.enqueueOrStart(
        userId.toString(),
        order._id.toString(),
        gmail.trim(),
        price
      );

      return res.status(200).json({
        success: true,
        status: queueResult.status, // 'waiting_otp' hoặc 'in_queue'
        orderId: order._id,
        queueId: queueResult.queueId,
        position: queueResult.position,
        totalInQueue: queueResult.totalInQueue,
        newBalance: updatedUser.balance,
        message: queueResult.message,
        rawPrompt: queueResult.rawPrompt,
      });
    } catch (queueErr) {
      console.error('❌ [Gemini Queue Start Error]:', queueErr.message);

      // Nếu lỗi ngay lập tức -> Hoàn tiền ví
      await User.findByIdAndUpdate(userId, { $inc: { balance: price } });
      order.status = 'cancelled';
      order.cancelNote = queueErr.message || 'Lỗi kết nối bot Telegram.';
      order.refunded = true;
      await order.save();

      return res.status(400).json({
        success: false,
        status: 'cancelled',
        message: queueErr.message || 'Không thể bắt đầu phiên kích hoạt từ Bot. Tiền đã được hoàn lại vào ví.',
        cancelNote: order.cancelNote,
        orderId: order._id,
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/gemini/queue-status
 * Tra cứu vị trí hàng đợi và trạng thái phiên hiện tại
 */
const getQueueStatus = async (req, res, next) => {
  try {
    const { orderId, queueId } = req.query;

    if (!orderId && !queueId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu orderId hoặc queueId để kiểm tra trạng thái.',
      });
    }

    const statusInfo = geminiQueue.getQueueStatus(orderId, queueId);

    // Nếu không còn trong RAM, kiểm tra xem DB đã ghi nhận hoàn thành hay bị hủy chưa
    if (statusInfo.status === 'not_found' && orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      const order = await Order.findById(orderId);
      if (order) {
        if (order.status === 'completed') {
          return res.json({
            success: true,
            inQueue: false,
            isMyTurn: false,
            status: 'completed',
            link: order.secretLink,
            orderId: order._id,
          });
        }
        if (order.status === 'cancelled') {
          return res.json({
            success: true,
            inQueue: false,
            isMyTurn: false,
            status: 'cancelled',
            error: order.cancelNote || 'Đơn hàng đã bị hủy.',
            orderId: order._id,
          });
        }
      }
    }

    return res.json({
      success: true,
      ...statusInfo,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/gemini/verify
 * Nhận mã OTP từ người dùng và gửi tới Bot
 */
const verifyGemini = async (req, res, next) => {
  try {
    const { otp, orderId } = req.body;
    const userId = req.user._id;

    if (!otp || !String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã OTP 6 số.',
      });
    }

    let targetOrderId = orderId;
    if (!targetOrderId || !mongoose.Types.ObjectId.isValid(targetOrderId)) {
      const pendingOrder = await Order.findOne({ userId, status: 'pending' }).sort({ createdAt: -1 });
      if (pendingOrder) {
        targetOrderId = pendingOrder._id.toString();
      }
    }

    if (!targetOrderId) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng đang chờ xác thực OTP.',
      });
    }

    const verifyResult = await geminiQueue.verifyOtp(targetOrderId, String(otp).trim());

    if (verifyResult.success && verifyResult.link) {
      return res.status(200).json({
        success: true,
        status: 'completed',
        link: verifyResult.link,
        orderId: targetOrderId,
        message: 'Kích hoạt thành công! Dưới đây là liên kết nhận dịch vụ của bạn.',
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 'cancelled',
        message: verifyResult.reason || 'Xác thực OTP thất bại. Hệ thống đã tự động hoàn tiền vào số dư ví của bạn.',
        cancelNote: verifyResult.reason,
        orderId: targetOrderId,
      });
    }
  } catch (err) {
    return res.status(400).json({
      success: false,
      status: 'error',
      message: err.message || 'Lỗi xác thực OTP.',
    });
  }
};

/**
 * POST /api/gemini/cancel-queue
 * Người dùng hủy phiên hoặc rời hàng đợi
 */
const cancelQueue = async (req, res, next) => {
  try {
    const { orderId, queueId } = req.body;
    const userId = req.user._id;

    const result = await geminiQueue.cancelQueue(orderId, queueId, userId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startGemini,
  getQueueStatus,
  verifyGemini,
  cancelQueue,
};
