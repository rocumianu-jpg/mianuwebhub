'use strict';

const express = require('express');
const router = express.Router();
const { getTheme, updateTheme, resetTheme } = require('../controllers/themeController');
const { protect, adminOnly } = require('../middleware/auth');

// Public: Lấy cấu hình background toàn trang
router.get('/', getTheme);

// Admin: Cập nhật & reset theme
router.put('/admin', protect, adminOnly, updateTheme);
router.post('/admin/reset', protect, adminOnly, resetTheme);

module.exports = router;
