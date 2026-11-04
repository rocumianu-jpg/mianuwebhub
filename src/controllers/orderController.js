'use strict';

const Order = require('../models/Order');

/**
 * GET /api/orders/my
 * Protected – returns the authenticated user's orders (with secretLinks).
 */
const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate('productId', 'title imageUrl')
      .sort({ createdAt: -1 });

    return res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyOrders };
