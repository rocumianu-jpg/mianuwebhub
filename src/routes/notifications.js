'use strict';

const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  markAllRead,
  adminGetNotifications,
  adminCreateNotification,
  adminToggleNotification,
  adminDeleteNotification,
} = require('../controllers/notificationController');
const { protect, adminOnly } = require('../middleware/auth');

// User routes (Yêu cầu đăng nhập)
router.get('/', protect, getMyNotifications);
router.post('/read-all', protect, markAllRead);

// Admin routes
router.get('/admin', protect, adminOnly, adminGetNotifications);
router.post('/admin', protect, adminOnly, adminCreateNotification);
router.put('/admin/:id/toggle', protect, adminOnly, adminToggleNotification);
router.delete('/admin/:id', protect, adminOnly, adminDeleteNotification);

module.exports = router;
