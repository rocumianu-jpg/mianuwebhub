'use strict';

const Announcement = require('../models/Announcement');

// Dữ liệu mẫu ban đầu nếu hệ thống chưa có cấu hình
const DEFAULT_ANNOUNCEMENT = {
  title: '⚠️ Lưu ý khi đặt đơn',
  isActive: true,
  items: [
    { icon: '📌', text: 'Dịch vụ được xử lý tự động và thủ công tuỳ theo mặt hàng bạn chọn.' },
    { icon: '⚠️', text: 'Vui lòng đọc kỹ thông số kỹ thuật và chế độ bảo hành trước khi thanh toán.' },
    { icon: '📌', text: 'Hệ thống hỗ trợ hoàn tiền ví tự động 100% nếu đơn hàng bị hủy hoặc quá thời gian.' },
    { icon: '⚠️', text: 'Tuyệt đối không chia sẻ mã OTP hoặc thông tin bảo mật tài khoản cho bất kỳ ai.' },
  ],
};

/**
 * GET /api/announcement
 * Lấy cấu hình Popup Lưu ý hiện tại (dành cho khách truy cập)
 */
const getAnnouncement = async (_req, res, next) => {
  try {
    let announcement = await Announcement.findOne().sort({ createdAt: -1 });

    if (!announcement) {
      announcement = await Announcement.create(DEFAULT_ANNOUNCEMENT);
    }

    return res.json({
      success: true,
      announcement,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/announcement
 * Cập nhật cấu hình Popup Lưu ý (Admin only)
 */
const updateAnnouncement = async (req, res, next) => {
  try {
    const { title, isActive, items } = req.body;

    let announcement = await Announcement.findOne().sort({ createdAt: -1 });

    if (!announcement) {
      announcement = new Announcement(DEFAULT_ANNOUNCEMENT);
    }

    if (title !== undefined) announcement.title = title.trim();
    if (isActive !== undefined) announcement.isActive = Boolean(isActive);
    if (items !== undefined && Array.isArray(items)) {
      announcement.items = items.map((it) => ({
        icon: it.icon ? it.icon.trim() : '📌',
        text: it.text ? it.text.trim() : '',
      })).filter((it) => it.text);
    }

    await announcement.save();

    return res.json({
      success: true,
      message: 'Cập nhật cấu hình Popup Lưu ý thành công!',
      announcement,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAnnouncement,
  updateAnnouncement,
};
