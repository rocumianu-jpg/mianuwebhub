'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// GET /api/deposit/info (protected)
router.get('/info', protect, (req, res) => {
  return res.json({
    success: true,
    depositInfo: {
      bankName: 'MB Bank (Ngân hàng Quân Đội)',
      bankCode: 'MB',
      accountNumber: '0987654321',
      accountHolder: 'NGUYEN VAN A',
      syntax: `NAP ${req.user.username.toUpperCase()}`,
      note: 'Vui lòng điền đúng cú pháp chuyển khoản.',
    },
  });
});

module.exports = router;
