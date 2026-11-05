'use strict';

const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const CoinTransaction = require('../models/CoinTransaction');

/* ─── Products ──────────────────────────────────────────────────────── */

const getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

const createProduct = async (req, res, next) => {
  try {
    const {
      title,
      imageUrl,
      price,
      stock,
      description,
      isActive,
      productType,
      platform,
      subCategory,
      secretItem,
      detailedDescription,
      customRequirementLabel,
      isCoinAllowed,
      coinPrice,
      isBestSeller,
    } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({ success: false, message: 'Tiêu đề và giá sản phẩm là bắt buộc' });
    }

    let initialStock = Number(stock) || 0;
    const secretLinks = [];

    if (secretItem && typeof secretItem === 'string' && secretItem.trim()) {
      secretLinks.push(secretItem.trim());
      if (initialStock < 1) {
        initialStock = 1;
      }
    }

    const normalizedProductType = ['manual', 'bot_gemini'].includes(productType)
      ? productType
      : 'instant';

    const product = await Product.create({
      title,
      imageUrl: imageUrl || '',
      price: Number(price),
      stock: initialStock,
      description: description || '',
      detailedDescription: detailedDescription || '',
      customRequirementLabel: customRequirementLabel ? customRequirementLabel.trim() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      productType: normalizedProductType,
      platform: platform ? platform.trim() : 'Khác',
      subCategory: subCategory ? subCategory.trim() : 'Mặc định',
      secretItem: secretItem ? secretItem.trim() : '',
      secretLinks,
      isCoinAllowed: Boolean(isCoinAllowed),
      coinPrice: Number(coinPrice) || 0,
      isBestSeller: Boolean(isBestSeller),
    });

    if (secretItem && secretItem.trim()) {
      await SecretVault.create({
        productId: product._id,
        secretLink: secretItem.trim(),
        isUsed: false,
      });
    }

    // Tự động phát thông báo sản phẩm mới
    try {
      await Notification.create({
        title: `✨ Sản phẩm mới: ${product.title}`,
        message: `Sản phẩm "${product.title}" vừa được mở bán với giá ${product.price.toLocaleString('vi-VN')} đ!`,
        type: 'system',
      });
    } catch (notifErr) {
      console.warn('Lỗi tạo notification sản phẩm mới:', notifErr.message);
    }

    return res.status(201).json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      imageUrl,
      price,
      stock,
      description,
      isActive,
      productType,
      platform,
      subCategory,
      secretItem,
      detailedDescription,
      customRequirementLabel,
      isCoinAllowed,
      coinPrice,
      isBestSeller,
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    // Tự động kiểm tra biến động giá để tạo thông báo
    if (price !== undefined && Number(price) !== product.price) {
      const oldPrice = product.price;
      const newPrice = Number(price);
      const isDiscount = newPrice < oldPrice;

      try {
        await Notification.create({
          title: isDiscount
            ? `📉 Giảm giá: ${product.title}`
            : `📈 Tăng giá: ${product.title}`,
          message: `${isDiscount ? 'Giảm giá' : 'Tăng giá'} từ: ${oldPrice.toLocaleString('vi-VN')} đ -> ${newPrice.toLocaleString('vi-VN')} đ`,
          type: 'price_change',
          data: {
            productId: product._id,
            productTitle: product.title,
            oldPrice,
            newPrice,
            direction: isDiscount ? 'down' : 'up',
          },
        });
      } catch (notifErr) {
        console.warn('Lỗi tạo notification thay đổi giá:', notifErr.message);
      }
    }

    if (title !== undefined) product.title = title;
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (price !== undefined) product.price = Number(price);
    if (stock !== undefined) product.stock = Number(stock);
    if (description !== undefined) product.description = description;
    if (detailedDescription !== undefined) product.detailedDescription = detailedDescription;
    if (customRequirementLabel !== undefined) product.customRequirementLabel = customRequirementLabel.trim();
    if (isActive !== undefined) product.isActive = Boolean(isActive);
    if (productType !== undefined) {
      product.productType = ['manual', 'bot_gemini'].includes(productType) ? productType : 'instant';
    }
    if (platform !== undefined) product.platform = platform.trim();
    if (subCategory !== undefined) product.subCategory = subCategory.trim();
    if (isCoinAllowed !== undefined) product.isCoinAllowed = Boolean(isCoinAllowed);
    if (coinPrice !== undefined) product.coinPrice = Number(coinPrice) || 0;
    if (isBestSeller !== undefined) product.isBestSeller = Boolean(isBestSeller);

    if (secretItem !== undefined) {
      const trimmedSecret = secretItem.trim();
      product.secretItem = trimmedSecret;
      if (trimmedSecret) {
        const existingVault = await SecretVault.findOne({
          productId: product._id,
          secretLink: trimmedSecret,
        });

        if (!existingVault) {
          await SecretVault.create({
            productId: product._id,
            secretLink: trimmedSecret,
            isUsed: false,
          });
          if (!product.secretLinks.includes(trimmedSecret)) {
            product.secretLinks.push(trimmedSecret);
          }
          if (product.stock === 0) {
            product.stock = 1;
          }
        }
      }
    }

    await product.save();
    return res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }
    await SecretVault.deleteMany({ productId: id });

    return res.json({ success: true, message: 'Đã xóa sản phẩm thành công' });
  } catch (err) {
    next(err);
  }
};

/* ─── SecretVault ───────────────────────────────────────────────────── */

const addVaultLinks = async (req, res, next) => {
  try {
    const productId = req.params.id;
    let rawLinks = req.body.links;

    if (typeof rawLinks === 'string') {
      rawLinks = rawLinks.split('\n');
    }

    if (!Array.isArray(rawLinks)) {
      return res.status(400).json({
        success: false,
        message: 'links phải là danh sách hoặc chuỗi phân tách theo dòng.',
      });
    }

    const cleanLinks = rawLinks.map((l) => String(l).trim()).filter(Boolean);

    if (cleanLinks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập ít nhất 1 link hợp lệ.',
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    const docs = cleanLinks.map((link) => ({
      productId,
      secretLink: link,
      isUsed: false,
    }));
    const inserted = await SecretVault.insertMany(docs);

    if (!product.secretLinks) {
      product.secretLinks = [];
    }
    product.secretLinks.push(...cleanLinks);
    product.stock += cleanLinks.length;
    await product.save();

    return res.status(201).json({
      success: true,
      message: `Đã nạp thành công ${inserted.length} link vào kho!`,
      inserted: inserted.length,
      newStock: product.stock,
      product,
    });
  } catch (err) {
    next(err);
  }
};

const addSecretLinks = addVaultLinks;

const getProductVaultStats = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    const total = await SecretVault.countDocuments({ productId });
    const unused = await SecretVault.countDocuments({ productId, isUsed: false });

    return res.json({
      success: true,
      productId,
      productTitle: product.title,
      total,
      unused,
      used: total - unused,
    });
  } catch (err) {
    next(err);
  }
};

const getVaultStats = async (req, res, next) => {
  try {
    const products = await Product.find().select('title stock');

    const stats = await Promise.all(
      products.map(async (p) => {
        const total = await SecretVault.countDocuments({ productId: p._id });
        const unused = await SecretVault.countDocuments({ productId: p._id, isUsed: false });
        return {
          productId: p._id,
          productTitle: p.title,
          stock: p.stock,
          total,
          unused,
          used: total - unused,
        };
      })
    );

    return res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
};

/* ─── Users ─────────────────────────────────────────────────────────── */

const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    return res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/users/:id/balance
 * Điều chỉnh số dư người dùng với 3 chế độ:
 * - 'add' (+): Cộng thêm vào số dư
 * - 'subtract' (-): Trừ bớt số dư (không âm)
 * - 'set' (=): Đặt số dư cố định chính xác (ví dụ 1000 hoặc 0)
 */
const adjustUserBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mode, amount } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, message: 'Số tiền phải là một số không âm hợp lệ.' });
    }

    const user = await User.findById(id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const oldBalance = user.balance || 0;
    let newBalance = oldBalance;

    if (mode === 'add') {
      newBalance = oldBalance + numAmount;
    } else if (mode === 'subtract') {
      newBalance = Math.max(0, oldBalance - numAmount);
    } else if (mode === 'set') {
      newBalance = numAmount;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Chế độ điều chỉnh không hợp lệ (phải là add, subtract hoặc set).',
      });
    }

    user.balance = newBalance;
    await user.save();

    const changeDesc =
      mode === 'add'
        ? `+${numAmount.toLocaleString('vi-VN')} đ`
        : mode === 'subtract'
        ? `-${numAmount.toLocaleString('vi-VN')} đ`
        : `đặt thành ${numAmount.toLocaleString('vi-VN')} đ`;

    // Tự động gửi thông báo biến động số dư cho User
    try {
      await Notification.create({
        userId: user._id,
        title: '💰 Biến động số dư ví',
        message: `Số dư ví của bạn vừa được Admin điều chỉnh (${changeDesc}). Số dư hiện tại: ${newBalance.toLocaleString('vi-VN')} đ.`,
        type: 'status',
      });
    } catch (notifErr) {
      console.warn('Lỗi tạo notification số dư:', notifErr.message);
    }

    return res.json({
      success: true,
      message: `Đã điều chỉnh số dư của ${user.username} (${changeDesc}). Số dư mới: ${newBalance.toLocaleString('vi-VN')} đ`,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        depositCode: user.depositCode,
        isBanned: user.isBanned,
        banReason: user.banReason,
      },
    });
  } catch (err) {
    next(err);
  }
};

const topUpUser = async (req, res, next) => {
  req.body.mode = 'add';
  return adjustUserBalance(req, res, next);
};

/**
 * PUT /api/admin/users/:id
 * Chỉnh sửa toàn bộ thông tin của User: Username, Email, depositCode, Role, isBanned, banReason
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email, depositCode, role, isBanned, banReason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    // Kiểm tra username nếu thay đổi
    if (username && username.toLowerCase().trim() !== user.username) {
      const cleanUsername = username.toLowerCase().trim();
      const existingUser = await User.findOne({ username: cleanUsername, _id: { $ne: id } });
      if (existingUser) {
        return res.status(409).json({ success: false, message: 'Tên đăng nhập này đã được sử dụng.' });
      }
      user.username = cleanUsername;
    }

    // Kiểm tra depositCode nếu thay đổi
    if (depositCode !== undefined && depositCode.trim() !== (user.depositCode || '')) {
      const cleanCode = depositCode.trim();
      if (cleanCode) {
        const existingCode = await User.findOne({ depositCode: cleanCode, _id: { $ne: id } });
        if (existingCode) {
          return res.status(409).json({ success: false, message: 'Mã định danh nạp tiền này đã tồn tại.' });
        }
        user.depositCode = cleanCode;
      } else {
        user.depositCode = undefined;
      }
    }

    if (email !== undefined) {
      user.email = email.toLowerCase().trim();
    }

    if (role && ['user', 'admin'].includes(role)) {
      user.role = role;
    }

    if (isBanned !== undefined) {
      user.isBanned = Boolean(isBanned);
      if (user.isBanned && banReason) {
        user.banReason = banReason.trim();
      } else if (!user.isBanned) {
        user.banReason = '';
      }
    }

    await user.save();

    return res.json({
      success: true,
      message: `Cập nhật thông tin người dùng ${user.username} thành công!`,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        depositCode: user.depositCode,
        isBanned: user.isBanned,
        banReason: user.banReason,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/admin/users/:id
 * Xóa vĩnh viễn tài khoản người dùng
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự xóa tài khoản của chính mình!' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng để xóa.' });
    }

    return res.json({
      success: true,
      message: `Đã xóa vĩnh viễn người dùng ${user.username}.`,
    });
  } catch (err) {
    next(err);
  }
};

/* ─── Orders Management & Refund ────────────────────────────────────── */

/**
 * GET /api/admin/orders
 * Lấy toàn bộ đơn hàng của hệ thống
 */
const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('userId', 'username balance email depositCode')
      .populate('productId', 'title imageUrl productType price')
      .sort({ createdAt: -1 });

    return res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/orders/:id/status
 * Cập nhật trạng thái đơn hàng (pending, processing, completed, cancelled)
 * Nếu trạng thái là 'cancelled' -> TỰ ĐỘNG HOÀN TIỀN VÀO VÍ USER
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, cancelNote, secretLink } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ. Phải là một trong: pending, processing, completed, cancelled',
      });
    }

    // ─── TỰ ĐỘNG HOÀN TIỀN NẾU HỦY ĐƠN ───
    if (status === 'cancelled') {
      if (!order.refunded) {
        if (order.paymentMethod === 'coin' && order.coinsPaid > 0) {
          const updatedUser = await User.findByIdAndUpdate(
            order.userId,
            { $inc: { coinBalance: order.coinsPaid } },
            { new: true }
          );
          await CoinTransaction.create({
            userId: order.userId,
            type: 'refund',
            amount: order.coinsPaid,
            balanceAfter: updatedUser ? updatedUser.coinBalance : 0,
            description: `Hoàn ${order.coinsPaid} Coin do đơn hàng #${order._id.toString().slice(-6)} bị hủy`,
            referenceId: order._id,
          });
        } else if (order.pricePaid > 0) {
          await User.findByIdAndUpdate(order.userId, {
            $inc: { balance: order.pricePaid },
          });
        }
        order.refunded = true;
      }
      order.cancelNote = cancelNote && cancelNote.trim()
        ? cancelNote.trim()
        : 'Đơn hàng bị hủy và đã hoàn tiền vào ví.';
    } else {
      if (cancelNote !== undefined) {
        order.cancelNote = cancelNote.trim();
      }
    }

    if (secretLink !== undefined) {
      order.secretLink = secretLink.trim();
    }

    if (status) {
      order.status = status;
    }

    await order.save();

    return res.json({
      success: true,
      message: status === 'cancelled'
        ? `Đã hủy đơn hàng và hoàn tiền ${order.pricePaid.toLocaleString('vi-VN')} đ cho khách hàng!`
        : 'Cập nhật trạng thái đơn hàng thành công!',
      order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/orders/bulk-update
 * Thao tác hàng loạt trên các đơn hàng đã chọn:
 * - 'completed': Hoàn thành tất cả các đơn đã chọn (kèm secretLink nếu có)
 * - 'cancelled': Hủy và tự động hoàn tiền vào ví cho tất cả khách hàng tương ứng
 */
const bulkUpdateOrders = async (req, res, next) => {
  try {
    const { orderIds, action, cancelNote, secretLink } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 đơn hàng để thao tác.' });
    }

    if (!['completed', 'cancelled'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Hành động không hợp lệ (chỉ hỗ trợ completed hoặc cancelled).',
      });
    }

    const orders = await Order.find({ _id: { $in: orderIds } });
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng nào trong danh sách đã chọn.' });
    }

    let affectedCount = 0;
    let totalRefunded = 0;

    for (const order of orders) {
      if (action === 'cancelled') {
        if (!order.refunded) {
          await User.findByIdAndUpdate(order.userId, { $inc: { balance: order.pricePaid } });
          order.refunded = true;
          totalRefunded += order.pricePaid;
        }
        order.status = 'cancelled';
        order.cancelNote = cancelNote && cancelNote.trim()
          ? cancelNote.trim()
          : 'Đơn hàng được Admin hủy và hoàn tiền hàng loạt.';
      } else if (action === 'completed') {
        order.status = 'completed';
        if (secretLink && secretLink.trim()) {
          order.secretLink = secretLink.trim();
        }
      }
      await order.save();
      affectedCount++;
    }

    const message =
      action === 'cancelled'
        ? `Đã hủy ${affectedCount} đơn hàng thành công và tự động hoàn lại tổng cộng ${totalRefunded.toLocaleString('vi-VN')} đ vào ví khách hàng!`
        : `Đã duyệt hoàn thành ${affectedCount} đơn hàng thành công!`;

    return res.json({
      success: true,
      message,
      affectedCount,
      totalRefunded,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addVaultLinks,
  addSecretLinks,
  getProductVaultStats,
  getVaultStats,
  getAllUsers,
  adjustUserBalance,
  topUpUser,
  updateUser,
  deleteUser,
  getAllOrders,
  updateOrderStatus,
  bulkUpdateOrders,
};