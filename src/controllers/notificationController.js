'use strict';

const Notification = require('../models/Notification');

/**
 * GET /api/notifications
 * Lấy danh sách thông báo cho người dùng hiện tại
 */
const getMyNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Lấy các thông báo đang hoạt động: thông báo chung (userId = null) hoặc gửi riêng cho user
    const notifications = await Notification.find({
      isActive: true,
      $or: [{ userId: null }, { userId }],
    })
      .sort({ createdAt: -1 })
      .limit(60);

    // Đếm số lượng thông báo chưa đọc
    const unreadCount = notifications.filter(
      (n) => !n.readBy.some((id) => String(id) === String(userId))
    ).length;

    return res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/read-all
 * Đánh dấu đã đọc tất cả thông báo
 */
const markAllRead = async (req, res, next) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      {
        isActive: true,
        $or: [{ userId: null }, { userId }],
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
      }
    );

    return res.json({
      success: true,
      message: 'Đã đánh dấu đã đọc tất cả thông báo.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/notifications/admin
 * Lấy toàn bộ thông báo hệ thống (Admin)
 */
const adminGetNotifications = async (_req, res, next) => {
  try {
    const notifications = await Notification.find()
      .populate('userId', 'username depositCode')
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/admin
 * Admin tự đăng thông báo mới
 */
const adminCreateNotification = async (req, res, next) => {
  try {
    const { title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Tiêu đề và nội dung thông báo là bắt buộc.',
      });
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      type: ['price_change', 'status', 'personal', 'system'].includes(type) ? type : 'system',
      userId: null, // Broadcast
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng thông báo mới thành công!',
      notification,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/notifications/admin/:id/toggle
 * Ẩn / Hiện thông báo
 */
const adminToggleNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
    }

    notification.isActive = !notification.isActive;
    await notification.save();

    return res.json({
      success: true,
      message: notification.isActive ? 'Đã hiển thị thông báo.' : 'Đã ẩn thông báo.',
      notification,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/notifications/admin/:id
 * Xóa thông báo
 */
const adminDeleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
    }

    return res.json({
      success: true,
      message: 'Đã xóa thông báo thành công.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyNotifications,
  markAllRead,
  adminGetNotifications,
  adminCreateNotification,
  adminToggleNotification,
  adminDeleteNotification,
};
