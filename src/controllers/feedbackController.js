'use strict';

const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const Order = require('../models/Order');

// Đếm số từ trong văn bản
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * POST /api/feedbacks
 * Tạo đánh giá mới cho đơn hàng (Chỉ đơn completed & chỉ chủ đơn hàng)
 */
const createFeedback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      orderId,
      rating,
      receivedStatus,
      productQuality,
      deliveryTimeRating,
      comment,
    } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, message: 'Số sao đánh giá phải từ 1 đến 5 sao.' });
    }

    if (comment && countWords(comment) > 200) {
      return res.status(400).json({ success: false, message: 'Nội dung nhận xét tối đa 200 từ.' });
    }

    // Kiểm tra đơn hàng có tồn tại và thuộc về user không
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (String(order.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể đánh giá đơn hàng của chính tài khoản mình.',
      });
    }

    // RÀNG BUỘC BẢO MẬT: Đơn hàng bắt buộc phải ở trạng thái completed
    if (order.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ những đơn hàng đã hoàn thành (completed) mới được phép gửi đánh giá.',
      });
    }

    // Kiểm tra đã đánh giá đơn này chưa (1 đơn chỉ được đánh giá 1 lần)
    const existing = await Feedback.findOne({ orderId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Đơn hàng này đã có đánh giá trước đó. Bạn có thể chỉnh sửa lại đánh giá này.',
        feedbackId: existing._id,
      });
    }

    const feedback = await Feedback.create({
      orderId: order._id,
      userId,
      productId: order.productId,
      rating: numRating,
      receivedStatus: receivedStatus || 'Đã nhận đủ',
      productQuality: productQuality || 'Rất tốt',
      deliveryTimeRating: deliveryTimeRating || 'Siêu nhanh',
      comment: comment ? comment.trim() : '',
      adminReply: '',
      isHidden: false,
    });

    const populated = await Feedback.findById(feedback._id)
      .populate('userId', 'username displayName avatarUrl depositCode')
      .populate('productId', 'title imageUrl');

    return res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã gửi đánh giá dịch vụ cho Mianu WorkShop! ⭐',
      feedback: populated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/feedbacks/:id
 * Chỉnh sửa đánh giá của chính mình
 */
const updateFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const {
      rating,
      receivedStatus,
      productQuality,
      deliveryTimeRating,
      comment,
    } = req.body;

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    // Chỉ chủ đánh giá hoặc admin mới được sửa
    if (String(feedback.userId) !== String(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền chỉnh sửa đánh giá này.',
      });
    }

    if (rating !== undefined) {
      const numRating = Number(rating);
      if (numRating >= 1 && numRating <= 5) {
        feedback.rating = numRating;
      }
    }

    if (receivedStatus !== undefined) feedback.receivedStatus = receivedStatus.trim();
    if (productQuality !== undefined) feedback.productQuality = productQuality.trim();
    if (deliveryTimeRating !== undefined) feedback.deliveryTimeRating = deliveryTimeRating.trim();

    if (comment !== undefined) {
      if (countWords(comment) > 200) {
        return res.status(400).json({ success: false, message: 'Nội dung nhận xét tối đa 200 từ.' });
      }
      feedback.comment = comment.trim();
    }

    await feedback.save();

    const populated = await Feedback.findById(feedback._id)
      .populate('userId', 'username displayName avatarUrl depositCode')
      .populate('productId', 'title imageUrl');

    return res.json({
      success: true,
      message: 'Cập nhật đánh giá thành công!',
      feedback: populated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedbacks/my
 * Lấy danh sách ID các đơn hàng mà user hiện tại đã đánh giá
 */
const getMyFeedbacks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const feedbacks = await Feedback.find({ userId }).select('orderId rating comment createdAt');
    return res.json({
      success: true,
      feedbacks,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedbacks/order/:orderId
 * Lấy đánh giá của một đơn hàng cụ thể
 */
const getFeedbackByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const feedback = await Feedback.findOne({ orderId })
      .populate('userId', 'username displayName avatarUrl depositCode')
      .populate('productId', 'title imageUrl');

    return res.json({
      success: true,
      feedback,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedbacks
 * Kênh hiển thị đánh giá công khai cho khách xem độ uy tín của Shop
 */
const getAllPublicFeedbacks = async (req, res, next) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    const filter = isAdmin ? {} : { isHidden: false };

    const feedbacks = await Feedback.find(filter)
      .populate('userId', 'username displayName avatarUrl depositCode')
      .populate('productId', 'title imageUrl platform subCategory')
      .sort({ createdAt: -1 });

    // Tính toán thống kê đánh giá
    const totalReviews = feedbacks.length;
    let sumRating = 0;
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    for (const f of feedbacks) {
      const r = Math.round(f.rating) || 5;
      sumRating += f.rating || 5;
      if (breakdown[r] !== undefined) {
        breakdown[r]++;
      }
    }

    const averageRating = totalReviews > 0 ? (sumRating / totalReviews).toFixed(1) : '5.0';

    return res.json({
      success: true,
      feedbacks,
      stats: {
        totalReviews,
        averageRating: Number(averageRating),
        breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/feedbacks/:id/reply
 * Phản hồi / Cảm ơn từ Admin
 */
const adminReplyFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminReply } = req.body;

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    feedback.adminReply = adminReply ? adminReply.trim() : '';
    await feedback.save();

    return res.json({
      success: true,
      message: 'Đã lưu phản hồi của Admin thành công!',
      feedback,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/feedbacks/:id/toggle-hidden
 * Ẩn hoặc Hiện đánh giá (Admin)
 */
const adminToggleHidden = async (req, res, next) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    feedback.isHidden = !feedback.isHidden;
    await feedback.save();

    return res.json({
      success: true,
      message: feedback.isHidden ? 'Đã ẩn đánh giá khỏi kênh công khai.' : 'Đã hiển thị lại đánh giá.',
      feedback,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/feedbacks/:id
 * Xóa vĩnh viễn đánh giá spam / không hợp lệ (Admin)
 */
const adminDeleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findByIdAndDelete(id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá để xóa.' });
    }

    return res.json({
      success: true,
      message: 'Đã xóa vĩnh viễn đánh giá thành công.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createFeedback,
  updateFeedback,
  getMyFeedbacks,
  getFeedbackByOrder,
  getAllPublicFeedbacks,
  adminReplyFeedback,
  adminToggleHidden,
  adminDeleteFeedback,
};
