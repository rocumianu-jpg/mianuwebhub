'use strict';

const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const User = require('../models/User');
const Order = require('../models/Order');

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

    const product = await Product.create({
      title,
      imageUrl: imageUrl || '',
      price: Number(price),
      stock: initialStock,
      description: description || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      productType: productType === 'manual' ? 'manual' : 'instant',
      platform: platform ? platform.trim() : 'Khác',
      subCategory: subCategory ? subCategory.trim() : 'Mặc định',
      secretItem: secretItem ? secretItem.trim() : '',
      secretLinks,
    });

    if (secretItem && secretItem.trim()) {
      await SecretVault.create({
        productId: product._id,
        secretLink: secretItem.trim(),
        isUsed: false,
      });
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
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    if (title !== undefined) product.title = title;
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (price !== undefined) product.price = Number(price);
    if (stock !== undefined) product.stock = Number(stock);
    if (description !== undefined) product.description = description;
    if (isActive !== undefined) product.isActive = Boolean(isActive);
    if (productType !== undefined) {
      product.productType = productType === 'manual' ? 'manual' : 'instant';
    }
    if (platform !== undefined) product.platform = platform.trim();
    if (subCategory !== undefined) product.subCategory = subCategory.trim();

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

const topUpUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền nạp phải là số dương hợp lệ' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $inc: { balance: amount } },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    return res.json({
      success: true,
      message: `Đã cộng ${amount.toLocaleString('vi-VN')} đ vào ví ${user.username}`,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
      },
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
      .populate('userId', 'username balance')
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
        await User.findByIdAndUpdate(order.userId, {
          $inc: { balance: order.pricePaid },
        });
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
  topUpUser,
  getAllOrders,
  updateOrderStatus,
};