'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const Order = require('../models/Order');
const User = require('../models/User');
const CoinTransaction = require('../models/CoinTransaction');

// GET /api/shop/products
const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

// POST /api/shop/buy
const buyProduct = async (req, res, next) => {
  const productId = req.body?.productId || req.params?.productId;
  const customerNote = (req.body?.customerNote || '').trim();
  const paymentMethod = req.body?.paymentMethod === 'coin' ? 'coin' : 'balance';
  const userId = req.user._id;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu productId trong yêu cầu.',
    });
  }

  // Thử khởi tạo Transaction (nếu MongoDB có Replica Set)
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

      if (product.customRequirementLabel && !customerNote) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Vui lòng cung cấp: ${product.customRequirementLabel}`,
        });
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
      }

      // ─── KIỂM TRA SỐ DƯ TƯƠNG ỨNG THEO PHƯƠNG THỨC THANH TOÁN ───
      if (paymentMethod === 'coin') {
        if (!product.isCoinAllowed) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm này hiện chưa hỗ trợ thanh toán bằng Coin.',
          });
        }

        const coinPrice = Number(product.coinPrice) || 0;
        if (coinPrice <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Giá Coin của sản phẩm chưa hợp lệ. Vui lòng liên hệ Admin.',
          });
        }

        const userCoins = user.coinBalance || 0;
        if (userCoins < coinPrice) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Số dư Coin không đủ! Giá sản phẩm: ${coinPrice.toLocaleString('vi-VN')} Coin, bạn đang có: ${userCoins.toLocaleString('vi-VN')} Coin. Hãy vượt thêm link tại mục Nhiệm vụ để nhận Coin miễn phí.`,
          });
        }
      } else {
        if (user.balance < product.price) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Số dư không đủ. Giá sản phẩm: ${product.price.toLocaleString('vi-VN')} đ, số dư hiện có: ${user.balance.toLocaleString('vi-VN')} đ. Vui lòng nạp thêm tiền.`,
          });
        }
      }

      const isManual = product.productType === 'manual';
      let deliveredLink = '';

      if (!isManual) {
        // Hàng Instant: Tìm link từ SecretVault hoặc secretLinks / secretItem
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
        // Hàng Manual: Trừ tồn kho nếu có
        if (product.stock > 0) {
          product.stock = Math.max(0, product.stock - 1);
          await product.save({ session });
        }
      }

      // Trừ tiền tương ứng
      let updatedUser;
      if (paymentMethod === 'coin') {
        const coinPrice = Number(product.coinPrice);
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { coinBalance: -coinPrice } },
          { new: true, session }
        );
      } else {
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { balance: -product.price } },
          { new: true, session }
        );
      }

      const orderStatus = isManual ? 'pending' : 'completed';
      const [order] = await Order.create(
        [
          {
            userId,
            productId: product._id,
            secretLink: deliveredLink,
            pricePaid: paymentMethod === 'coin' ? 0 : product.price,
            paymentMethod,
            coinsPaid: paymentMethod === 'coin' ? product.coinPrice : 0,
            productTitle: product.title,
            status: orderStatus,
            customerNote,
            cancelNote: '',
          },
        ],
        { session }
      );

      // Nếu thanh toán bằng Coin, ghi nhật ký CoinTransaction
      if (paymentMethod === 'coin') {
        await CoinTransaction.create(
          [
            {
              userId,
              type: 'purchase',
              amount: -product.coinPrice,
              balanceAfter: updatedUser.coinBalance,
              description: `Mua sản phẩm: ${product.title}`,
              referenceId: order._id,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: isManual
          ? 'Đặt hàng thành công! Đơn hàng đang được đưa vào danh sách xử lý thủ công.'
          : 'Mua hàng thành công! Đã nhận được liên kết bí mật.',
        order,
        newBalance: updatedUser.balance,
        newCoinBalance: updatedUser.coinBalance,
        secretItem: deliveredLink,
      });
    } else {
      // Chế độ dự phòng cho MongoDB Standalone (Không có Replica Set)
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({ success: false, message: 'Sản phẩm không khả dụng.' });
      }

      if (product.customRequirementLabel && !customerNote) {
        return res.status(400).json({
          success: false,
          message: `Vui lòng cung cấp: ${product.customRequirementLabel}`,
        });
      }

      // Kiểm tra hỗ trợ Coin nếu chọn coin
      if (paymentMethod === 'coin') {
        if (!product.isCoinAllowed) {
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm này hiện chưa hỗ trợ thanh toán bằng Coin.',
          });
        }

        const coinPrice = Number(product.coinPrice) || 0;
        if (coinPrice <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Giá Coin của sản phẩm chưa hợp lệ.',
          });
        }
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
          await product.save();
        } else if (product.secretItem && product.secretItem.trim()) {
          deliveredLink = product.secretItem.trim();
        }

        if (!deliveredLink) {
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm tạm thời đã hết kho. Vui lòng quay lại sau.',
          });
        }
      }

      // Trừ tiền nguyên tử
      let updatedUser;
      if (paymentMethod === 'coin') {
        const coinPrice = Number(product.coinPrice);
        updatedUser = await User.findOneAndUpdate(
          { _id: userId, coinBalance: { $gte: coinPrice } },
          { $inc: { coinBalance: -coinPrice } },
          { new: true }
        );
      } else {
        updatedUser = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: product.price } },
          { $inc: { balance: -product.price } },
          { new: true }
        );
      }

      if (!updatedUser) {
        // Rollback lại kho nếu đã trừ
        if (deliveredLink) {
          await SecretVault.findOneAndUpdate({ secretLink: deliveredLink }, { isUsed: false });
        }
        const currentUser = await User.findById(userId);
        return res.status(400).json({
          success: false,
          message:
            paymentMethod === 'coin'
              ? `Số dư Coin không đủ (${(currentUser?.coinBalance || 0).toLocaleString('vi-VN')} / ${product.coinPrice} Coin).`
              : 'Số dư không đủ để thực hiện thanh toán.',
        });
      }

      if (product.stock > 0) {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: -1 } });
      }

      const orderStatus = isManual ? 'pending' : 'completed';
      const order = await Order.create({
        userId,
        productId: product._id,
        secretLink: deliveredLink,
        pricePaid: paymentMethod === 'coin' ? 0 : product.price,
        paymentMethod,
        coinsPaid: paymentMethod === 'coin' ? product.coinPrice : 0,
        productTitle: product.title,
        status: orderStatus,
        customerNote,
        cancelNote: '',
      });

      if (paymentMethod === 'coin') {
        await CoinTransaction.create({
          userId,
          type: 'purchase',
          amount: -product.coinPrice,
          balanceAfter: updatedUser.coinBalance,
          description: `Mua sản phẩm: ${product.title}`,
          referenceId: order._id,
        });
      }

      return res.status(200).json({
        success: true,
        message: isManual
          ? 'Đặt hàng thành công! Đơn hàng đang được chờ xử lý.'
          : 'Mua hàng thành công! Đã nhận được liên kết bí mật.',
        order,
        newBalance: updatedUser.balance,
        newCoinBalance: updatedUser.coinBalance,
        secretItem: deliveredLink,
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
