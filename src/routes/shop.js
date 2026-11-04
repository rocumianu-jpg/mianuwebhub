'use strict';

const express = require('express');
const router = express.Router();

const { getProducts, buyProduct } = require('../controllers/shopController');
const { protect } = require('../middleware/auth');

// GET /api/shop/products  (public)
router.get('/products', getProducts);

// POST /api/shop/buy/:productId  (protected)
router.post('/buy/:productId', protect, buyProduct);

module.exports = router;
