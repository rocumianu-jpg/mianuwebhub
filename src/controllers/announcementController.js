'use strict';

const Announcement = require('../models/Announcement');

// Dữ liệu mẫu ban đầu nếu hệ thống chưa có cấu hình
const DEFAULT_ANNOUNCEMENT = {
  title: '⚠️ Lưu ý khi đặt đơn',
  isActive: true,
  displayTarget: 'all',
  targetPath: '',
  targetPlatform: '',
  targetSubCategory: '',
  items: [
    { icon: '📌', text: 'Dịch vụ được xử lý tự động và thủ công tuỳ theo mặt hàng bạn chọn.' },
    { icon: '⚠️', text: 'Vui lòng đọc kỹ thông số kỹ thuật và chế độ bảo hành trước khi thanh toán.' },
    { icon: '📌', text: 'Hệ thống hỗ trợ hoàn tiền ví tự động 100% nếu đơn hàng bị hủy hoặc quá thời gian.' },
    { icon: '⚠️', text: 'Tuyệt đối không chia sẻ mã OTP hoặc thông tin bảo mật tài khoản cho bất kỳ ai.' },
  ],
};

/**
 * Hàm chuẩn hóa đường dẫn URL:
 * Cắt bỏ giao thức http/https, tên miền, decode URI và chuẩn hóa định dạng /path?params
 */
function normalizeUrlPath(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.trim();

  try {
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      const u = new URL(cleaned);
      cleaned = u.pathname + u.search;
    } else if (cleaned.includes('/') && !cleaned.startsWith('/')) {
      // ví dụ: mianuwebhub.store/shop?platform=...
      const idx = cleaned.indexOf('/');
      cleaned = cleaned.substring(idx);
    }
  } catch (e) {
    cleaned = cleaned.replace(/^https?:\/\/[^/]+/i, '');
  }

  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (e) {}

  return cleaned.trim();
}

/**
 * GET /api/announcement
 * Lấy Popup Lưu ý động theo URL hiện tại hoặc Product ID
 * Query params: ?path=/shop&fullPath=/shop?platform=Discord&subCategory=Nitro&platform=Discord&subCategory=Nitro&productId=...
 */
const getAnnouncement = async (req, res, next) => {
  try {
    const { path, fullPath, platform, subCategory, productId } = req.query;

    let announcement = null;

    // ─── ƯU TIÊN 1: Popup theo sản phẩm cụ thể nếu có productId ──────────────
    if (productId) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'product',
        targetProductId: productId,
      });
    }

    // ─── ƯU TIÊN 2: Khớp Popup theo Mục Lục / Danh Mục Sản Phẩm ───────────────
    // A. Khớp cả Nền tảng + Mục con (ví dụ: Discord > Nitro)
    if (!announcement && platform && subCategory) {
      const cleanPlatform = platform.trim();
      const cleanSub = subCategory.trim();
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'category',
        targetPlatform: { $regex: new RegExp(`^${cleanPlatform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        targetSubCategory: { $regex: new RegExp(`^${cleanSub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
    }

    // B. Khớp Nền tảng chung nếu mục con không có popup riêng (ví dụ: Discord chung)
    if (!announcement && platform) {
      const cleanPlatform = platform.trim();
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'category',
        targetPlatform: { $regex: new RegExp(`^${cleanPlatform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        $or: [{ targetSubCategory: '' }, { targetSubCategory: null }],
      });
    }

    // ─── ƯU TIÊN 3: Khớp theo Custom URL Path (chuẩn hóa domain, decode, so khớp param) ─
    if (!announcement && (fullPath || path)) {
      const customAnnouncements = await Announcement.find({
        isActive: true,
        displayTarget: 'custom',
      });

      const reqFullNorm = normalizeUrlPath(fullPath || path).toLowerCase();
      const reqPathNorm = normalizeUrlPath(path || fullPath).toLowerCase();

      for (const c of customAnnouncements) {
        const targetNorm = normalizeUrlPath(c.targetPath).toLowerCase();
        if (!targetNorm) continue;

        // So khớp trực tiếp chuỗi URL chuẩn hóa
        if (targetNorm === reqFullNorm || targetNorm === reqPathNorm) {
          announcement = c;
          break;
        }

        // So khớp thông minh theo Path + từng Query Parameter
        if (targetNorm.includes('?')) {
          const [tBase, tQuery] = targetNorm.split('?');
          const [rBase, rQuery] = reqFullNorm.split('?');

          if (tBase === rBase && rQuery) {
            const tParams = new URLSearchParams(tQuery);
            const rParams = new URLSearchParams(rQuery);

            let allMatch = true;
            for (const [key, val] of tParams.entries()) {
              if (rParams.get(key)?.toLowerCase() !== val?.toLowerCase()) {
                allMatch = false;
                break;
              }
            }
            if (allMatch) {
              announcement = c;
              break;
            }
          }
        }
      }
    }

    // ─── ƯU TIÊN 4: Popup trang Cửa Hàng (/shop) - chỉ hiện khi không có popup mục cụ thể ─
    if (!announcement && path && path.startsWith('/shop')) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'shop',
      });
    }

    // ─── ƯU TIÊN 5: Popup Trang Chủ (/) ──────────────────────────────────────
    if (!announcement && (path === '/' || path === '')) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'home',
      });
    }

    // ─── ƯU TIÊN 6: Popup chung toàn trang ('all') ────────────────────────────
    if (!announcement) {
      announcement = await Announcement.findOne({
        isActive: true,
        displayTarget: 'all',
      }).sort({ updatedAt: -1 });
    }

    // ─── 7. Khởi tạo dữ liệu mặc định nếu DB rỗng ────────────────────────────
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
    const {
      title,
      isActive,
      displayTarget,
      targetPlatform,
      targetSubCategory,
      targetProductId,
      targetPath,
      items,
    } = req.body;

    let cleanedPath = targetPath ? normalizeUrlPath(targetPath) : '';
    if (displayTarget === 'category' && targetPlatform) {
      cleanedPath = `/shop?platform=${encodeURIComponent(targetPlatform)}${
        targetSubCategory ? `&subCategory=${encodeURIComponent(targetSubCategory)}` : ''
      }`;
    }

    const newPopup = await Announcement.create({
      title: title ? title.trim() : '⚠️ Lưu ý khi đặt đơn',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      displayTarget: displayTarget || 'all',
      targetPlatform: targetPlatform ? targetPlatform.trim() : '',
      targetSubCategory: targetSubCategory ? targetSubCategory.trim() : '',
      targetProductId: targetProductId || null,
      targetPath: cleanedPath,
      items: Array.isArray(items)
        ? items
            .map((it) => ({
              icon: it.icon ? it.icon.trim() : '📌',
              text: it.text ? it.text.trim() : '',
            }))
            .filter((it) => it.text)
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
    const {
      title,
      isActive,
      displayTarget,
      targetPlatform,
      targetSubCategory,
      targetProductId,
      targetPath,
      items,
    } = req.body;

    const popup = await Announcement.findById(id);
    if (!popup) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Popup này.' });
    }

    if (title !== undefined) popup.title = title.trim();
    if (isActive !== undefined) popup.isActive = Boolean(isActive);
    if (displayTarget !== undefined) popup.displayTarget = displayTarget;
    if (targetPlatform !== undefined) popup.targetPlatform = targetPlatform.trim();
    if (targetSubCategory !== undefined) popup.targetSubCategory = targetSubCategory.trim();
    if (targetProductId !== undefined) popup.targetProductId = targetProductId || null;

    if (targetPath !== undefined) {
      popup.targetPath = targetPath ? normalizeUrlPath(targetPath) : '';
    }
    if (popup.displayTarget === 'category' && popup.targetPlatform) {
      popup.targetPath = `/shop?platform=${encodeURIComponent(popup.targetPlatform)}${
        popup.targetSubCategory ? `&subCategory=${encodeURIComponent(popup.targetSubCategory)}` : ''
      }`;
    }

    if (items !== undefined && Array.isArray(items)) {
      popup.items = items
        .map((it) => ({
          icon: it.icon ? it.icon.trim() : '📌',
          text: it.text ? it.text.trim() : '',
        }))
        .filter((it) => it.text);
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
