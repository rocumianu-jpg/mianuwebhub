'use strict';

const express = require('express');
const router = express.Router();

const { getProducts, buyProduct } = require('../controllers/shopController');
const { protect } = require('../middleware/auth');

// GET /api/shop/products (Public) - Lấy danh sách sản phẩm
router.get('/products', getProducts);

// POST /api/shop/buy (Protected) - Mua hàng: body { productId }
router.post('/buy', protect, buyProduct);

// POST /api/shop/buy/:productId (Protected) - Dự phòng truyền ID qua URL
router.post('/buy/:productId', protect, buyProduct);

module.exports = router;