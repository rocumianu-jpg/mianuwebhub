'use strict';

const express = require('express');
const router = express.Router();

const { getProducts, buyProduct } = require('../controllers/shopController');
const { protect } = require('../middleware/auth');

// GET /api/shop/products (Public) - Lấy danh sách sản phẩm
router.get('/products', getProducts);

// POST /api/shop/buy (Protected) - Mua hàng với body: { productId: "..." }
router.post('/buy', protect, buyProduct);

// POST /api/shop/buy/:productId (Protected) - Hỗ trợ cả trường hợp truyền id trên URL
router.post('/buy/:productId', protect, buyProduct);

module.exports = router;