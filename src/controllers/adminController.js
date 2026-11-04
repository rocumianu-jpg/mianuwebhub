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
    const { title, imageUrl, price, description, isActive } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({ success: false, message: 'title and price are required' });
    }

    const product = await Product.create({ title, imageUrl, price, description, isActive });
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
    const updates = req.body;

    const product = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
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
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
};

/* ─── SecretVault ───────────────────────────────────────────────────── */

/**
 * POST /api/admin/products/:id/vault
 * Body: { links: ['url1', 'url2', ...] }
 */
const addSecretLinks = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { links } = req.body;

    if (!Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ success: false, message: 'links must be a non-empty array' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const docs = links.map((link) => ({ productId, secretLink: link, isUsed: false }));
    const inserted = await SecretVault.insertMany(docs);

    // Increment product stock
    product.stock += links.length;
    await product.save();

    return res.status(201).json({
      success: true,
      inserted: inserted.length,
      newStock: product.stock,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/products/:id/vault
 * Returns vault stats for a single product.
 */
const getProductVaultStats = async (req, res, next) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
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
 * GET /api/admin/vault-stats
 * Returns vault stats for every product.
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
 * Body: { amount: Number }
 */
const topUpUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $inc: { balance: amount } },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
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
  addSecretLinks,
  getProductVaultStats,
  getVaultStats,
  getAllUsers,
  topUpUser,
};
