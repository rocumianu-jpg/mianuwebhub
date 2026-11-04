'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const telegramUserbot = require('../services/telegramUserbot');

/**
 * POST /api/gemini/start
 * Nhận gmail, trừ tiền ví, gọi Userbot gửi /run và gửi gmail tới @ngtrungthanhvip_bot
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
      cancelNote: `Đang gửi lệnh kích hoạt cho email ${gmail.trim()}`,
      refunded: false,
    });

    try {
      // Gọi service Userbot giao tiếp với @ngtrungthanhvip_bot
      const botResult = await telegramUserbot.startGeminiActivation(gmail.trim(), order._id.toString());

      return res.status(200).json({
        success: true,
        status: 'waiting_otp',
        orderId: order._id,
        newBalance: updatedUser.balance,
        message: 'Bot đã tiếp nhận Gmail và yêu cầu mã OTP. Vui lòng kiểm tra hộp thư và nhập 6 số OTP.',
        rawPrompt: botResult.rawPrompt,
      });
    } catch (botErr) {
      console.error('❌ [Userbot Start Error]:', botErr.message);

      // Nếu bot báo lỗi ngay từ đầu -> Tự động hoàn tiền ví cho User và hủy đơn
      await User.findByIdAndUpdate(userId, { $inc: { balance: price } });

      order.status = 'cancelled';
      order.cancelNote = botErr.message || 'Lỗi giao tiếp với Telegram Bot khi gửi Gmail.';
      order.refunded = true;
      await order.save();

      return res.status(400).json({
        success: false,
        status: 'cancelled',
        message: botErr.message || 'Không thể bắt đầu phiên kích hoạt từ Bot. Tiền đã được hoàn lại vào ví.',
        cancelNote: order.cancelNote,
        orderId: order._id,
      });
    }
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

    // Tìm đơn hàng tương ứng
    let order = null;
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findOne({ _id: orderId, userId });
    } else {
      order = await Order.findOne({ userId, status: 'pending' }).sort({ createdAt: -1 });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng đang chờ xác thực OTP.',
      });
    }

    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng này đã được kích hoạt thành công trước đó.',
        link: order.secretLink,
      });
    }

    // Gửi OTP qua Telegram Userbot
    const verifyResult = await telegramUserbot.verifyGeminiOtp(String(otp).trim(), order._id.toString());

    if (verifyResult.success && verifyResult.link) {
      // Kích hoạt thành công: Đơn hàng hoàn thành & lưu link
      order.status = 'completed';
      order.secretLink = verifyResult.link;
      order.cancelNote = '';
      await order.save();

      return res.status(200).json({
        success: true,
        status: 'completed',
        link: verifyResult.link,
        orderId: order._id,
        message: 'Kích hoạt thành công! Dưới đây là liên kết nhận dịch vụ của bạn.',
      });
    } else {
      // Thất bại: Hoàn tiền ví lại cho user
      if (!order.refunded) {
        await User.findByIdAndUpdate(order.userId, { $inc: { balance: order.pricePaid } });
        order.refunded = true;
      }

      order.status = 'cancelled';
      order.cancelNote = verifyResult.reason || 'Bot báo sai mã OTP hoặc không lấy được link.';
      await order.save();

      return res.status(400).json({
        success: false,
        status: 'cancelled',
        message: 'Xác thực OTP thất bại. Hệ thống đã tự động hoàn tiền vào số dư ví của bạn.',
        cancelNote: order.cancelNote,
        orderId: order._id,
      });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  startGemini,
  verifyGemini,
};