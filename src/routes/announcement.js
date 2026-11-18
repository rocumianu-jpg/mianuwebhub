'use strict';

const express = require('express');
const router = express.Router();
const {
  getAnnouncement,
  updateAnnouncement,
  adminGetAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
} = require('../controllers/announcementController');
const { protect, adminOnly } = require('../middleware/auth');

// Public: lấy thông tin hiển thị popup theo ngữ cảnh (path, productId)
router.get('/', getAnnouncement);

// Admin: Cập nhật popup mặc định (backward compatibility)
router.put('/', protect, adminOnly, updateAnnouncement);

// Admin: Quản lý danh sách popup động đa trang
router.get('/admin/list', protect, adminOnly, adminGetAnnouncements);
router.post('/admin', protect, adminOnly, adminCreateAnnouncement);
router.put('/admin/:id', protect, adminOnly, adminUpdateAnnouncement);
router.delete('/admin/:id', protect, adminOnly, adminDeleteAnnouncement);

module.exports = router;
