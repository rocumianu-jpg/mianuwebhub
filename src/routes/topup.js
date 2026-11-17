'use strict';

const express = require('express');
const router = express.Router();
const {
  submitCard,
  handleTSRCallback,
  getUserHistory,
  adminGetTopups,
} = require('../controllers/topupController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── USER ROUTES (BẢO VỆ BẰNG JWT) ───────────────────────────────────────────
// POST /api/topup: Khách gửi thẻ cào
router.post('/', protect, submitCard);

// GET /api/topup/history: Khách xem lịch sử nạp thẻ
router.get('/history', protect, getUserHistory);

// ─── WEBHOOK CALLBACK (PUBLIC CHO THESIEURE GỌI VÀO) ─────────────────────────
// Cổng gạch thẻ TheSieuRe gửi kết quả về qua POST (hoặc GET khi test)
router.post('/callback', handleTSRCallback);
router.get('/callback', handleTSRCallback);

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────
router.get('/admin/list', protect, adminOnly, adminGetTopups);

module.exports = router;
