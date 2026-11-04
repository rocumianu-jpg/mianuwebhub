'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const Order = require('../models/Order');
const User = require('../models/User');

const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

const buyProduct = async (req, res, next) => {
  const productId = req.body?.productId || req.params?.productId;
  const userId = req.user._id;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu productId trong yêu cầu.',
    });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (err) {
    session = null;
  }

  try {
    if (session) {
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
          message: `Số dư không đủ. Giá sản phẩm là ${product.price.toLocaleString('vi-VN')} đ, số dư hiện có là ${user.balance.toLocaleString('vi-VN')} đ. Vui lòng nạp thêm tiền.`,
        });
      }

      const isManual = product.productType === 'manual';
      let deliveredLink = '';

      if (!isManual) {
        const vault = await SecretVault.findOneAndUpdate(
          { productId: product._id, isUsed: false },
          { $set: { isUsed: true } },
          { new: true, session }
        );

        if (vault) {
          deliveredLink = vault.secretLink;
        } else if (product.secretLinks && product.secretLinks.length > 0) {
          deliveredLink = product.secretLinks.shift();
        } else if (product.secretItem && product.secretItem.trim()) {
          deliveredLink = product.secretItem.trim();
        }

        if (!deliveredLink) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm có sẵn này tạm thời đã hết hàng trong kho. Vui lòng quay lại sau.',
          });
        }

        product.stock = Math.max(0, product.stock - 1);
        await product.save({ session });
      } else {
        if (product.stock > 0) {
          product.stock = Math.max(0, product.stock - 1);
          await product.save({ session });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: -product.price } },
        { new: true, session }
      );

      const orderStatus = isManual ? 'pending' : 'completed';
      const [order] = await Order.create(
        [
          {
            userId,
            productId: product._id,
            secretLink: deliveredLink,
            pricePaid: product.price,
            productTitle: product.title,
            status: orderStatus,
            cancelNote: '',
            refunded: false,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        success: true,
        message: isManual
          ? 'Đặt hàng thành công! Đơn hàng đang chờ Admin xử lý.'
          : 'Mua hàng thành công!',
        order: {
          _id: order._id,
          id: order._id,
          productId: order.productId,
          productTitle: order.productTitle,
          secretLink: order.secretLink,
          secretItem: order.secretLink,
          pricePaid: order.pricePaid,
          status: order.status,
          createdAt: order.createdAt,
        },
        secretItem: order.secretLink,
        secretLink: order.secretLink,
        newBalance: updatedUser.balance,
      });
    } else {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
      }

      if (!product.isActive) {
        return res.status(400).json({ success: false, message: 'Sản phẩm hiện đang tạm ngừng kinh doanh.' });
      }

      const isManual = product.productType === 'manual';
      let deliveredLink = '';

      if (!isManual) {
        const vault = await SecretVault.findOneAndUpdate(
          { productId: product._id, isUsed: false },
          { $set: { isUsed: true } },
          { new: true }
        );

        if (vault) {
          deliveredLink = vault.secretLink;
        } else if (product.secretLinks && product.secretLinks.length > 0) {
          deliveredLink = product.secretLinks.shift();
        } else if (product.secretItem && product.secretItem.trim()) {
          deliveredLink = product.secretItem.trim();
        }

        if (!deliveredLink) {
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm có sẵn này tạm thời đã hết hàng trong kho. Vui lòng quay lại sau.',
          });
        }
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, balance: { $gte: product.price } },
        { $inc: { balance: -product.price } },
        { new: true }
      );

      if (!updatedUser) {
        if (!isManual && deliveredLink) {
          await SecretVault.findOneAndUpdate(
            { productId: product._id, secretLink: deliveredLink },
            { $set: { isUsed: false } }
          );
        }
        const currentUser = await User.findById(userId);
        return res.status(400).json({
          success: false,
          message: `Số dư không đủ. Giá sản phẩm là ${product.price.toLocaleString('vi-VN')} đ, số dư hiện có là ${(currentUser?.balance || 0).toLocaleString('vi-VN')} đ. Vui lòng nạp thêm tiền.`,
        });
      }

      if (product.stock > 0) {
        product.stock = Math.max(0, product.stock - 1);
        await product.save();
      }

      const orderStatus = isManual ? 'pending' : 'completed';
      const order = await Order.create({
        userId,
        productId: product._id,
        secretLink: deliveredLink,
        pricePaid: product.price,
        productTitle: product.title,
        status: orderStatus,
        cancelNote: '',
        refunded: false,
      });

      return res.status(201).json({
        success: true,
        message: isManual
          ? 'Đặt hàng thành công! Đơn hàng đang chờ Admin xử lý.'
          : 'Mua hàng thành công!',
        order: {
          _id: order._id,
          id: order._id,
          productId: order.productId,
          productTitle: order.productTitle,
          secretLink: order.secretLink,
          secretItem: order.secretLink,
          pricePaid: order.pricePaid,
          status: order.status,
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