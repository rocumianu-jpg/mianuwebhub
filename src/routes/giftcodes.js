'use strict';

const express = require('express');
const router = express.Router();
const { redeemGiftCode } = require('../controllers/giftcodeController');
const { protect } = require('../middleware/auth');

// Đổi mã thưởng dành cho User (yêu cầu đăng nhập)
router.post('/redeem', protect, redeemGiftCode);

module.exports = router;
