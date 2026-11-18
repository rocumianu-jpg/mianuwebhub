'use strict';

const mongoose = require('mongoose');
const axios = require('axios');
const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const Order = require('../models/Order');
const User = require('../models/User');
const CoinTransaction = require('../models/CoinTransaction');

/**
 * Tự động kích hoạt Webhook sang API bên thứ 3 (Auto API) khi đơn hàng thanh toán thành công
 * (Dùng cho nạp Robux tự động, nạp thẻ game, kích hoạt tài khoản bản quyền bên thứ 3...)
 */
async function triggerProductWebhook(product, order, user, customerNote) {
  try {
    const config = product.apiIntegration;
    if (!config || !config.isEnabled || !config.endpointUrl) return;

    const endpoint = config.endpointUrl.trim();
    const method = (config.method || 'POST').toUpperCase();

    // Dữ liệu payload bắn sang hệ thống bên thứ 3
    const payload = {
      event: 'order.completed',
      orderId: order._id.toString(),
      productId: product._id.toString(),
      productTitle: order.productTitle,
      variantId: order.variantId || null,
      variantName: order.variantName || null,
      pricePaid: order.pricePaid,
      paymentMethod: order.paymentMethod,
      coinsPaid: order.coinsPaid || 0,
      customerRequirement: customerNote || '',
      buyer: {
        id: user._id.toString(),
        username: user.username,
        email: user.email || '',
      },
      createdAt: order.createdAt,
    };

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'MianuWebHub-AutoAPI/2.5',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      headers['X-API-Key'] = config.apiKey.trim();
    }

    if (config.customHeaders && typeof config.customHeaders.forEach === 'function') {
      config.customHeaders.forEach((val, key) => {
        headers[key] = val;
      });
    }

    let response;
    if (method === 'GET') {
      const queryParams = new URLSearchParams({
        orderId: payload.orderId,
        username: payload.buyer.username,
        customerRequirement: customerNote || '',
      });
      const separator = endpoint.includes('?') ? '&' : '?';
      response = await axios.get(`${endpoint}${separator}${queryParams.toString()}`, {
        headers,
        timeout: 15000,
      });
    } else {
      response = await axios.post(endpoint, payload, { headers, timeout: 15000 });
    }

    // Cập nhật trạng thái thành công cho đơn hàng
    order.apiWebhookStatus = 'success';
    order.apiWebhookResponse =
      typeof response.data === 'object' ? response.data : { raw: String(response.data) };
    await order.save();
    console.log(`[AutoAPI Success] Đơn hàng #${order._id} gọi API thành công: ${endpoint}`);
  } catch (err) {
    console.error(`[AutoAPI Error] Đơn hàng #${order._id} lỗi Webhook:`, err.message);
    order.apiWebhookStatus = 'failed';
    order.apiWebhookResponse = {
      error: err.message,
      status: err.response?.status,
      data: err.response?.data,
    };
    await order.save().catch(() => {});
  }
}

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
  const variantId = req.body?.variantId || null;
  const customerNote = (req.body?.customerNote || '').trim();
  const paymentMethod = req.body?.paymentMethod === 'coin' ? 'coin' : 'balance';
  const userId = req.user._id;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu productId trong yêu cầu.',
    });
  }

  // Khởi tạo Transaction nếu MongoDB hỗ trợ Replica Set
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

      // Xử lý gói dịch vụ / Biến thể (Variants - Decao)
      let selectedVariant = null;
      let effectivePrice = product.price;
      let effectiveCoinPrice = product.coinPrice || 0;
      let effectiveCoinAllowed = product.isCoinAllowed || product.isCoinOnly;
      let orderTitle = product.title;

      if (product.hasVariants && product.variants && product.variants.length > 0) {
        if (!variantId) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Vui lòng chọn một gói dịch vụ cụ thể (Gói ngày, tuần, tháng...).',
          });
        }

        selectedVariant = product.variants.id(variantId) || product.variants.find((v) => v._id.toString() === variantId);
        if (!selectedVariant) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Gói dịch vụ đã chọn không tồn tại hoặc đã bị gỡ bỏ.',
          });
        }

        effectivePrice = selectedVariant.price;
        effectiveCoinPrice = selectedVariant.coinPrice || 0;
        effectiveCoinAllowed = selectedVariant.isCoinAllowed || product.isCoinAllowed;
        orderTitle = `${product.title} - ${selectedVariant.name}`;
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

      // ─── KIỂM TRA SẢN PHẨM ĐỘC QUYỀN COIN ───
      if (product.isCoinOnly && paymentMethod !== 'coin') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Sản phẩm này là vật phẩm độc quyền, chỉ cho phép đổi hoặc thanh toán bằng Coin!',
        });
      }

      // ─── KIỂM TRA SỐ DƯ TƯƠNG ỨNG THEO PHƯƠNG THỨC THANH TOÁN ───
      if (paymentMethod === 'coin') {
        if (!effectiveCoinAllowed) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Gói sản phẩm này hiện chưa hỗ trợ thanh toán bằng Coin.',
          });
        }

        if (effectiveCoinPrice <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Giá Coin của sản phẩm chưa hợp lệ. Vui lòng liên hệ Admin.',
          });
        }

        const userCoins = user.coinBalance || 0;
        if (userCoins < effectiveCoinPrice) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Số dư Coin không đủ! Giá gói: ${effectiveCoinPrice.toLocaleString('vi-VN')} Coin, bạn đang có: ${userCoins.toLocaleString('vi-VN')} Coin.`,
          });
        }
      } else {
        if (user.balance < effectivePrice) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Số dư không đủ. Giá sản phẩm: ${effectivePrice.toLocaleString('vi-VN')} đ, số dư ví hiện có: ${user.balance.toLocaleString('vi-VN')} đ. Vui lòng nạp thêm tiền.`,
          });
        }
      }

      const isManual = product.productType === 'manual' || product.productType === 'auto_api';
      let deliveredLink = '';

      if (product.productType === 'instant') {
        // Hàng Instant: Ưu tiên lấy từ kho riêng của biến thể nếu có
        if (selectedVariant && selectedVariant.secretLinks && selectedVariant.secretLinks.length > 0) {
          deliveredLink = selectedVariant.secretLinks.shift();
          selectedVariant.stock = Math.max(0, (selectedVariant.stock || 1) - 1);
        } else {
          // Lấy từ SecretVault hoặc secretLinks của sản phẩm gốc
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
        }

        if (!deliveredLink) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Gói sản phẩm này tạm thời đã hết hàng trong kho. Vui lòng quay lại sau.',
          });
        }

        product.stock = Math.max(0, product.stock - 1);
        await product.save({ session });
      } else {
        // Hàng Manual / Auto API: Trừ kho biến thể và kho cha nếu có
        if (selectedVariant && selectedVariant.stock > 0) {
          selectedVariant.stock = Math.max(0, selectedVariant.stock - 1);
        }
        if (product.stock > 0) {
          product.stock = Math.max(0, product.stock - 1);
        }
        await product.save({ session });
      }

      // Trừ tiền / Coin của người dùng
      let updatedUser;
      if (paymentMethod === 'coin') {
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { coinBalance: -effectiveCoinPrice } },
          { new: true, session }
        );
      } else {
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { balance: -effectivePrice } },
          { new: true, session }
        );
      }

      const orderStatus = product.productType === 'instant' ? 'completed' : 'pending';
      const [order] = await Order.create(
        [
          {
            userId,
            productId: product._id,
            secretLink: deliveredLink,
            pricePaid: paymentMethod === 'coin' ? 0 : effectivePrice,
            paymentMethod,
            coinsPaid: paymentMethod === 'coin' ? effectiveCoinPrice : 0,
            productTitle: orderTitle,
            variantId: selectedVariant ? selectedVariant._id.toString() : null,
            variantName: selectedVariant ? selectedVariant.name : '',
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
              amount: -effectiveCoinPrice,
              balanceAfter: updatedUser.coinBalance,
              description: `Mua: ${orderTitle}`,
              referenceId: order._id,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      // Tự động kích hoạt Webhook bên thứ 3 nếu có
      if (product.productType === 'auto_api' || (product.apiIntegration && product.apiIntegration.isEnabled)) {
        triggerProductWebhook(product, order, user, customerNote);
      }

      return res.status(200).json({
        success: true,
        message:
          product.productType === 'instant'
            ? 'Mua hàng thành công! Đã nhận được liên kết/vật phẩm bí mật.'
            : 'Đặt hàng thành công! Đơn hàng đang được hệ thống xử lý.',
        order,
        newBalance: updatedUser.balance,
        newCoinBalance: updatedUser.coinBalance,
        secretItem: deliveredLink,
      });
    } else {
      // ─── CHẾ ĐỘ DỰ PHÒNG KHI KHÔNG CÓ REPLICA SET ───
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({ success: false, message: 'Sản phẩm không khả dụng.' });
      }

      let selectedVariant = null;
      let effectivePrice = product.price;
      let effectiveCoinPrice = product.coinPrice || 0;
      let effectiveCoinAllowed = product.isCoinAllowed || product.isCoinOnly;
      let orderTitle = product.title;

      if (product.hasVariants && product.variants && product.variants.length > 0) {
        if (!variantId) {
          return res.status(400).json({
            success: false,
            message: 'Vui lòng chọn một gói dịch vụ cụ thể.',
          });
        }
        selectedVariant = product.variants.id(variantId) || product.variants.find((v) => v._id.toString() === variantId);
        if (!selectedVariant) {
          return res.status(400).json({
            success: false,
            message: 'Gói dịch vụ đã chọn không tồn tại.',
          });
        }
        effectivePrice = selectedVariant.price;
        effectiveCoinPrice = selectedVariant.coinPrice || 0;
        effectiveCoinAllowed = selectedVariant.isCoinAllowed || product.isCoinAllowed;
        orderTitle = `${product.title} - ${selectedVariant.name}`;
      }

      if (product.customRequirementLabel && !customerNote) {
        return res.status(400).json({
          success: false,
          message: `Vui lòng cung cấp: ${product.customRequirementLabel}`,
        });
      }

      // Trừ tiền / Coin
      let updatedUser;
      if (paymentMethod === 'coin') {
        if (!effectiveCoinAllowed) {
          return res.status(400).json({
            success: false,
            message: 'Gói sản phẩm này hiện chưa hỗ trợ thanh toán bằng Coin.',
          });
        }
        updatedUser = await User.findOneAndUpdate(
          { _id: userId, coinBalance: { $gte: effectiveCoinPrice } },
          { $inc: { coinBalance: -effectiveCoinPrice } },
          { new: true }
        );
      } else {
        updatedUser = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: effectivePrice } },
          { $inc: { balance: -effectivePrice } },
          { new: true }
        );
      }

      if (!updatedUser) {
        const currentUser = await User.findById(userId);
        return res.status(400).json({
          success: false,
          message:
            paymentMethod === 'coin'
              ? `Số dư Coin không đủ (${(currentUser?.coinBalance || 0).toLocaleString('vi-VN')} / ${effectiveCoinPrice} Coin).`
              : 'Số dư ví không đủ để thực hiện thanh toán.',
        });
      }

      let deliveredLink = '';
      if (product.productType === 'instant') {
        if (selectedVariant && selectedVariant.secretLinks && selectedVariant.secretLinks.length > 0) {
          deliveredLink = selectedVariant.secretLinks.shift();
          selectedVariant.stock = Math.max(0, (selectedVariant.stock || 1) - 1);
        } else {
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
        }

        if (!deliveredLink) {
          // Hoàn tiền nếu hết kho
          if (paymentMethod === 'coin') {
            await User.findByIdAndUpdate(userId, { $inc: { coinBalance: effectiveCoinPrice } });
          } else {
            await User.findByIdAndUpdate(userId, { $inc: { balance: effectivePrice } });
          }
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm tạm thời đã hết kho. Số dư của bạn đã được hoàn lại đầy đủ.',
          });
        }
        await product.save();
      }

      const orderStatus = product.productType === 'instant' ? 'completed' : 'pending';
      const order = await Order.create({
        userId,
        productId: product._id,
        secretLink: deliveredLink,
        pricePaid: paymentMethod === 'coin' ? 0 : effectivePrice,
        paymentMethod,
        coinsPaid: paymentMethod === 'coin' ? effectiveCoinPrice : 0,
        productTitle: orderTitle,
        variantId: selectedVariant ? selectedVariant._id.toString() : null,
        variantName: selectedVariant ? selectedVariant.name : '',
        status: orderStatus,
        customerNote,
        cancelNote: '',
      });

      if (paymentMethod === 'coin') {
        await CoinTransaction.create({
          userId,
          type: 'purchase',
          amount: -effectiveCoinPrice,
          balanceAfter: updatedUser.coinBalance,
          description: `Mua: ${orderTitle}`,
          referenceId: order._id,
        });
      }

      // Kích hoạt Webhook API thứ 3 nếu có
      if (product.productType === 'auto_api' || (product.apiIntegration && product.apiIntegration.isEnabled)) {
        triggerProductWebhook(product, order, updatedUser, customerNote);
      }

      return res.status(200).json({
        success: true,
        message:
          product.productType === 'instant'
            ? 'Mua hàng thành công! Đã nhận được liên kết bí mật.'
            : 'Đặt hàng thành công! Đơn hàng đang được chờ xử lý.',
        order,
        newBalance: updatedUser.balance,
        newCoinBalance: updatedUser.coinBalance,
        secretItem: deliveredLink,
      });
    }
  } catch (err) {
    if (session) {
      await session.abortTransaction().catch(() => {});
      session.endSession();
    }
    next(err);
  }
};

module.exports = {
  getProducts,
  buyProduct,
};
