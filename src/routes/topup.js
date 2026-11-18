'use strict';

const express = require('express');
const router = express.Router();
const {
  submitCard,
  submitManualCard,
  adminApproveManualCard,
  adminRejectManualCard,
  handleTSRCallback,
  getUserHistory,
  adminGetTopups,
  getTopupConfig,
  adminUpdateTopupConfig,
} = require('../controllers/topupController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── PUBLIC / USER CONFIG ROUTE ──────────────────────────────────────────────
// GET /api/topup/config: Lấy chế độ nạp thẻ hiện tại (auto_tsr hoặc manual)
router.get('/config', getTopupConfig);

// ─── USER ROUTES (BẢO VỆ BẰNG JWT) ───────────────────────────────────────────
// POST /api/topup: Khách gửi thẻ cào tự động qua TheSieuRe
router.post('/', protect, submitCard);

// POST /api/topup/manual: Khách gửi thẻ cào nạp thủ công (chờ Admin duyệt)
router.post('/manual', protect, submitManualCard);

// GET /api/topup/history: Khách xem lịch sử nạp thẻ
router.get('/history', protect, getUserHistory);

// ─── WEBHOOK CALLBACK (PUBLIC CHO THESIEURE GỌI VÀO) ─────────────────────────
// Cổng gạch thẻ TheSieuRe gửi kết quả về qua POST (hoặc GET khi test)
router.post('/callback', handleTSRCallback);
router.get('/callback', handleTSRCallback);

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────
router.get('/admin/list', protect, adminOnly, adminGetTopups);
router.put('/admin/config', protect, adminOnly, adminUpdateTopupConfig);
router.post('/admin/:id/approve', protect, adminOnly, adminApproveManualCard);
router.post('/admin/:id/reject', protect, adminOnly, adminRejectManualCard);

module.exports = router;
