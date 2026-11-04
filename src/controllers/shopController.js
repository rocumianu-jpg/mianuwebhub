'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const Order = require('../models/Order');
const User = require('../models/User');

/**
 * GET /api/shop/products
 * Public – returns all active products.
 */
const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/shop/buy/:productId
 * Protected – purchase a product using a MongoDB session/transaction.
 */
const buyProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Fetch product (outside session – read-only pre-check)
    const product = await Product.findById(productId);
    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (!product.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Product is not available' });
    }

    // 1. Re-fetch user within session to get latest balance
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 2. Check balance
    if (user.balance < product.price) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // 3. Atomically claim one unused SecretVault entry
    const vault = await SecretVault.findOneAndUpdate(
      { productId: product._id, isUsed: false },
      { $set: { isUsed: true } },
      { new: true, session }
    );
    if (!vault) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Out of stock' });
    }

    // 4. Deduct user balance
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: -product.price } },
      { new: true, session }
    );

    // 5. Decrement product stock
    await Product.findByIdAndUpdate(
      product._id,
      { $inc: { stock: -1 } },
      { session }
    );

    // 6. Create order
    const [order] = await Order.create(
      [
        {
          userId,
          productId: product._id,
          secretLink: vault.secretLink,
          pricePaid: product.price,
          productTitle: product.title,
        },
      ],
      { session }
    );

    // 7. Commit
    await session.commitTransaction();
    session.endSession();

    // 8. Return result
    return res.status(201).json({
      success: true,
      order: {
        id: order._id,
        productId: order.productId,
        productTitle: order.productTitle,
        secretLink: order.secretLink,
        pricePaid: order.pricePaid,
        createdAt: order.createdAt,
      },
      newBalance: updatedUser.balance,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

module.exports = { getProducts, buyProduct };
