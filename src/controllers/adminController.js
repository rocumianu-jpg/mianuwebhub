'use strict';

const Product = require('../models/Product');
const SecretVault = require('../models/SecretVault');
const User = require('../models/User');

/* ─── Products ──────────────────────────────────────────────────────── */

/**
 * GET /api/admin/products
 */
const getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/products
 */
const createProduct = async (req, res, next) => {
  try {
    const {
      title,
      imageUrl,
      price,
      stock,
      description,
      isActive,
      platform,
      subCategory,
      secretItem,
    } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({ success: false, message: 'Tiêu đề và giá sản phẩm là bắt buộc' });
    }

    let initialStock = Number(stock) || 0;
    const secretLinks = [];

    // Nếu admin nhập trực tiếp "Vật phẩm / Link bí mật sau thanh toán"
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
      platform: platform ? platform.trim() : 'Khác',
      subCategory: subCategory ? subCategory.trim() : 'Mặc định',
      secretItem: secretItem ? secretItem.trim() : '',
      secretLinks,
    });

    // Đồng thời tạo 1 bản ghi trong SecretVault nếu có secretItem
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

/**
 * PUT /api/admin/products/:id
 */
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
    if (platform !== undefined) product.platform = platform.trim();
    if (subCategory !== undefined) product.subCategory = subCategory.trim();

    // Nếu admin nhập/sửa secretItem mới
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

/**
 * DELETE /api/admin/products/:id
 */
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

/**
 * POST /api/admin/vault/:id/links
 * Nạp link vào kho bí mật & cập nhật tồn kho
 */
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

    // 1. Thêm vào bảng SecretVault
    const docs = cleanLinks.map((link) => ({
      productId,
      secretLink: link,
      isUsed: false,
    }));
    const inserted = await SecretVault.insertMany(docs);

    // 2. Thêm vào mảng secretLinks trong Product và tăng tồn kho
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

/**
 * GET /api/admin/products/:id/vault
 */
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

/**
 * GET /api/admin/vault/stats
 */
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

/**
 * GET /api/admin/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    return res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/users/:id/topup
 */
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
};