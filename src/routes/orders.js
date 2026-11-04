'use strict';

const express = require('express');
const router = express.Router();

const { getMyOrders, buyProduct } = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

// GET /api/orders/my - Xem danh sách đơn hàng đã mua
router.get('/my', protect, getMyOrders);

// POST /api/orders/buy - Mua hàng tự động
router.post('/buy', protect, buyProduct);

module.exports = router;