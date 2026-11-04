'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const Order = require('../models/Order');
const User = require('../models/User');

/**
 * GET /api/shop/products
 * Public – Lấy danh sách sản phẩm đang hoạt động.
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
 * POST /api/shop/buy hoặc POST /api/shop/buy/:productId
 * Protected – Xử lý mua hàng:
 * 1. Nhận productId từ req.body hoặc req.params
 * 2. Kiểm tra tồn kho & số dư ví người dùng
 * 3. Trừ tiền ví
 * 4. Lấy link bí mật từ SecretVault (đánh dấu isUsed = true)
 * 5. Tạo đơn hàng và trả về secretItem / secretLink cùng số dư mới
 */
const buyProduct = async (req, res, next) => {
  const productId = req.body?.productId || req.params?.productId;
  const userId = req.user._id;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu productId trong yêu cầu.',
    });
  }

  // Thử khởi tạo session transaction (nếu MongoDB có bật Replica Set)
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (err) {
    session = null;
  }

  try {
    if (session) {
      // ─── CHẾ ĐỘ 1: MONGO TRANSACTION ───
      const product = await Product.findById(productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
      }

      if (!product.isActive) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Sản phẩm hiện đang tạm ngừng kinh doanh.' });
      }

      // 1. Kiểm tra số dư người dùng
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
      }

      if (user.balance < product.price) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Số dư không đủ. Giá sản phẩm là ${product.price.toLocaleString('vi-VN')} đ, số dư hiện có là ${user.balance.toLocaleString('vi-VN')} đ.`,
        });
      }

      // 2. Lấy link bí mật từ SecretVault
      const vault = await SecretVault.findOneAndUpdate(
        { productId: product._id, isUsed: false },
        { $set: { isUsed: true } },
        { new: true, session }
      );

      if (!vault) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Sản phẩm này tạm thời đã hết hàng trong kho.' });
      }

      // 3. Trừ tiền tài khoản
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: -product.price } },
        { new: true, session }
      );

      // 4. Giảm số lượng tồn kho
      await Product.findByIdAndUpdate(
        product._id,
        { $inc: { stock: -1 } },
        { session }
      );

      // 5. Tạo đơn hàng mới
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

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        success: true,
        message: 'Mua hàng thành công!',
        order: {
          _id: order._id,
          id: order._id,
          productId: order.productId,
          productTitle: order.productTitle,
          secretLink: order.secretLink,
          secretItem: order.secretLink,
          pricePaid: order.pricePaid,
          createdAt: order.createdAt,
        },
        secretItem: order.secretLink,
        secretLink: order.secretLink,
        newBalance: updatedUser.balance,
      });
    } else {
      // ─── CHẾ ĐỘ 2: ATOMIC FALLBACK (CHO MONGO STANDALONE) ───
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
      }

      if (!product.isActive) {
        return res.status(400).json({ success: false, message: 'Sản phẩm hiện đang tạm ngừng kinh doanh.' });
      }

      // 1. Trừ tiền có điều kiện: chỉ trừ nếu balance >= price
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, balance: { $gte: product.price } },
        { $inc: { balance: -product.price } },
        { new: true }
      );

      if (!updatedUser) {
        const currentUser = await User.findById(userId);
        return res.status(400).json({
          success: false,
          message: `Số dư không đủ. Giá sản phẩm là ${product.price.toLocaleString('vi-VN')} đ, số dư hiện có là ${(currentUser?.balance || 0).toLocaleString('vi-VN')} đ.`,
        });
      }

      // 2. Lấy 1 link bí mật từ kho
      const vault = await SecretVault.findOneAndUpdate(
        { productId: product._id, isUsed: false },
        { $set: { isUsed: true } },
        { new: true }
      );

      if (!vault) {
        // Hoàn tiền nếu kho hết hàng
        await User.findByIdAndUpdate(userId, { $inc: { balance: product.price } });
        return res.status(400).json({
          success: false,
          message: 'Sản phẩm này tạm thời đã hết hàng trong kho. Tiền đã được hoàn lại.',
        });
      }

      // 3. Giảm tồn kho sản phẩm
      await Product.findByIdAndUpdate(product._id, { $inc: { stock: -1 } });

      // 4. Tạo bản ghi Order
      const order = await Order.create({
        userId,
        productId: product._id,
        secretLink: vault.secretLink,
        pricePaid: product.price,
        productTitle: product.title,
      });

      return res.status(201).json({
        success: true,
        message: 'Mua hàng thành công!',
        order: {
          _id: order._id,
          id: order._id,
          productId: order.productId,
          productTitle: order.productTitle,
          secretLink: order.secretLink,
          secretItem: order.secretLink,
          pricePaid: order.pricePaid,
          createdAt: order.createdAt,
        },
        secretItem: order.secretLink,
        secretLink: order.secretLink,
        newBalance: updatedUser.balance,
      });
    }
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    next(err);
  }
};

module.exports = {
  getProducts,
  buyProduct,
};