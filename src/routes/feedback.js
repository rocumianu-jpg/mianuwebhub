'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  createFeedback,
  updateFeedback,
  getMyFeedbacks,
  getFeedbackByOrder,
  getAllPublicFeedbacks,
  adminReplyFeedback,
  adminToggleHidden,
  adminDeleteFeedback,
} = require('../controllers/feedbackController');
const { protect, adminOnly } = require('../middleware/auth');

// Optional auth để nhận diện nếu khách truy cập là Admin
const optionalProtect = async (req, _res, next) => {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user) req.user = user;
    }
  } catch {
    // Bỏ qua lỗi nếu không có token
  }
  next();
};

// ─── Public routes ───────────────────────────────────────────────────────────
router.get('/', optionalProtect, getAllPublicFeedbacks);
router.get('/order/:orderId', getFeedbackByOrder);

// ─── User protected routes ───────────────────────────────────────────────────
router.get('/my', protect, getMyFeedbacks);
router.post('/', protect, createFeedback);
router.put('/:id', protect, updateFeedback);

// ─── Admin moderation routes ─────────────────────────────────────────────────
router.put('/:id/reply', protect, adminOnly, adminReplyFeedback);
router.put('/:id/toggle-hidden', protect, adminOnly, adminToggleHidden);
router.delete('/:id', protect, adminOnly, adminDeleteFeedback);

module.exports = router;
