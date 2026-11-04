'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// GET /api/deposit/info  (protected)
router.get('/info', protect, (req, res) => {
  return res.json({
    success: true,
    depositInfo: {
      bankName: 'Vietcombank',
      accountNumber: '1234567890',
      accountHolder: 'NGUYEN VAN A',
      syntax: `NAP ${req.user.username.toUpperCase()}`,
    },
  });
});

module.exports = router;
