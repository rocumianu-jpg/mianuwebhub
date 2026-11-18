'use strict';

const ThemeSetting = require('../models/ThemeSetting');

const DEFAULT_THEME = {
  bgImageUrl: '',
  bgImageEnabled: false,
  bgOverlayOpacity: 60,
};

/**
 * GET /api/theme
 * Lấy cấu hình theme & ảnh nền toàn trang (công khai cho mọi khách truy cập)
 */
const getTheme = async (req, res, next) => {
  try {
    let theme = await ThemeSetting.findOne({ key: 'global_theme' });
    if (!theme) {
      theme = await ThemeSetting.create({
        key: 'global_theme',
        ...DEFAULT_THEME,
      });
    }

    return res.json({
      success: true,
      theme: {
        bgImageUrl: theme.bgImageUrl || '',
        bgImageEnabled: Boolean(theme.bgImageEnabled),
        bgOverlayOpacity: typeof theme.bgOverlayOpacity === 'number' ? theme.bgOverlayOpacity : 60,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/theme/admin
 * Admin cập nhật cấu hình ảnh nền GIF/JPG và độ mờ overlay chống lóa
 */
const updateTheme = async (req, res, next) => {
  try {
    const { bgImageUrl, bgImageEnabled, bgOverlayOpacity } = req.body;

    let opacity = parseInt(bgOverlayOpacity);
    if (isNaN(opacity)) opacity = 60;
    // Ràng buộc bảo vệ: Giới hạn độ tối overlay từ 0% đến 90%
    opacity = Math.max(0, Math.min(90, opacity));

    const theme = await ThemeSetting.findOneAndUpdate(
      { key: 'global_theme' },
      {
        key: 'global_theme',
        bgImageUrl: typeof bgImageUrl === 'string' ? bgImageUrl.trim() : '',
        bgImageEnabled: Boolean(bgImageEnabled),
        bgOverlayOpacity: opacity,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: 'Cập nhật cấu hình giao diện & ảnh nền toàn trang thành công',
      theme: {
        bgImageUrl: theme.bgImageUrl,
        bgImageEnabled: theme.bgImageEnabled,
        bgOverlayOpacity: theme.bgOverlayOpacity,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/theme/admin/reset
 * Khôi phục theme về nền mặc định
 */
const resetTheme = async (req, res, next) => {
  try {
    const theme = await ThemeSetting.findOneAndUpdate(
      { key: 'global_theme' },
      {
        key: 'global_theme',
        ...DEFAULT_THEME,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: 'Đã khôi phục giao diện về nền mặc định ban đầu',
      theme: {
        bgImageUrl: theme.bgImageUrl,
        bgImageEnabled: theme.bgImageEnabled,
        bgOverlayOpacity: theme.bgOverlayOpacity,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTheme,
  updateTheme,
  resetTheme,
  DEFAULT_THEME,
};
