'use strict';

const Announcement = require('../models/Announcement');

// Dữ liệu mẫu ban đầu nếu hệ thống chưa có cấu hình
const DEFAULT_ANNOUNCEMENT = {
  title: '⚠️ Lưu ý khi đặt đơn',
  isActive: true,
  displayTarget: 'all',
  targetPath: '',
  items: [
    { icon: '📌', text: 'Dịch vụ được xử lý tự động và thủ công tuỳ theo mặt hàng bạn chọn.' },
    { icon: '⚠️', text: 'Vui lòng đọc kỹ thông số kỹ thuật và chế độ bảo hành trước khi thanh toán.' },
    { icon: '📌', text: 'Hệ thống hỗ trợ hoàn tiền ví tự động 100% nếu đơn hàng bị hủy hoặc quá thời gian.' },
    { icon: '⚠️', text: 'Tuyệt đối không chia sẻ mã OTP hoặc thông tin bảo mật tài khoản cho bất kỳ ai.' },
  ],
};

/**
 * GET /api/announcement
 * Lấy Popup Lưu ý động theo URL hiện tại hoặc Product ID
 * Query params: ?path=/&productId=...
 */
const getAnnouncement = async (req, res, next) => {
  try {
    const { path, productId } = req.query;

    let announcement = null;

    // 1. Ưu tiên tìm popup theo sản phẩm cụ thể nếu có productId
    if (productId) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'product',
        targetProductId: productId,
      });
    }

    // 2. Tìm popup theo URL chính xác (custom targetPath)
    if (!announcement && path) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'custom',
        targetPath: path.trim(),
      });
    }

    // 3. Tìm popup theo nhóm trang: Trang chủ (/) hoặc Cửa hàng (/shop)
    if (!announcement && path) {
      if (path === '/' || path === '') {
        announcement = await Announcement.findOne({
          isActive: true,
          displayTarget: 'home',
        });
      } else if (path.startsWith('/shop')) {
        announcement = await Announcement.findOne({
          isActive: true,
          displayTarget: 'shop',
        });
      }
    }

    // 4. Nếu chưa thấy popup riêng, tìm popup chung áp dụng cho tất cả ('all')
    if (!announcement) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'all',
      }).sort({ updatedAt: -1 });
    }

    // 5. Khởi tạo dữ liệu mặc định nếu database trống hoàn toàn
    if (!announcement) {
      const count = await Announcement.countDocuments();
      if (count === 0) {
        announcement = await Announcement.create(DEFAULT_ANNOUNCEMENT);
      }
    }

    return res.json({
      success: true,
      announcement: announcement && announcement.isActive ? announcement : null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/announcement/admin/list
 * Admin: Lấy danh sách toàn bộ các Popup lưu ý để quản lý
 */
const adminGetAnnouncements = async (_req, res, next) => {
  try {
    const announcements = await Announcement.find()
      .populate('targetProductId', 'title price')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      announcements,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/announcement/admin
 * Admin: Tạo Popup lưu ý mới
 */
const adminCreateAnnouncement = async (req, res, next) => {
  try {
    const { title, isActive, displayTarget, targetProductId, targetPath, items } = req.body;

    const newPopup = await Announcement.create({
      title: title ? title.trim() : '⚠️ Lưu ý khi đặt đơn',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      displayTarget: displayTarget || 'all',
      targetProductId: targetProductId || null,
      targetPath: targetPath ? targetPath.trim() : '',
      items: Array.isArray(items)
        ? items.map((it) => ({
            icon: it.icon ? it.icon.trim() : '📌',
            text: it.text ? it.text.trim() : '',
          })).filter((it) => it.text)
        : [],
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo Popup thông báo động mới thành công!',
      announcement: newPopup,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/announcement/admin/:id
 * Admin: Cập nhật Popup lưu ý theo ID
 */
const adminUpdateAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, isActive, displayTarget, targetProductId, targetPath, items } = req.body;

    const popup = await Announcement.findById(id);
    if (!popup) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Popup này.' });
    }

    if (title !== undefined) popup.title = title.trim();
    if (isActive !== undefined) popup.isActive = Boolean(isActive);
    if (displayTarget !== undefined) popup.displayTarget = displayTarget;
    if (targetProductId !== undefined) popup.targetProductId = targetProductId || null;
    if (targetPath !== undefined) popup.targetPath = targetPath.trim();
    if (items !== undefined && Array.isArray(items)) {
      popup.items = items.map((it) => ({
        icon: it.icon ? it.icon.trim() : '📌',
        text: it.text ? it.text.trim() : '',
      })).filter((it) => it.text);
    }

    await popup.save();

    return res.json({
      success: true,
      message: 'Cập nhật Popup thành công!',
      announcement: popup,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/announcement/admin/:id
 * Admin: Xóa Popup lưu ý theo ID
 */
const adminDeleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Announcement.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Popup cần xóa.' });
    }

    return res.json({
      success: true,
      message: 'Đã xóa Popup lưu ý thành công!',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/announcement
 * Cập nhật cấu hình Popup Lưu ý mặc định (Backward compatibility)
 */
const updateAnnouncement = async (req, res, next) => {
  try {
    const { title, isActive, items, displayTarget, targetPath } = req.body;

    let announcement = await Announcement.findOne().sort({ createdAt: -1 });

    if (!announcement) {
      announcement = new Announcement(DEFAULT_ANNOUNCEMENT);
    }

    if (title !== undefined) announcement.title = title.trim();
    if (isActive !== undefined) announcement.isActive = Boolean(isActive);
    if (displayTarget !== undefined) announcement.displayTarget = displayTarget;
    if (targetPath !== undefined) announcement.targetPath = targetPath.trim();
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
  adminGetAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
};
