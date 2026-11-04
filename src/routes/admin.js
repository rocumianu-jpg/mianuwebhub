'use strict';

const express = require('express');
const router = express.Router();

const {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addSecretLinks,
  getProductVaultStats,
  getVaultStats,
  getAllUsers,
  topUpUser,
} = require('../controllers/adminController');

const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

/* ─── Product routes ─────────────────────────── */
// GET  /api/admin/products
router.get('/products', getAllProducts);

// POST /api/admin/products
router.post('/products', createProduct);

// PUT  /api/admin/products/:id
router.put('/products/:id', updateProduct);

// DELETE /api/admin/products/:id
router.delete('/products/:id', deleteProduct);

// POST /api/admin/products/:id/vault  – add secret links
router.post('/products/:id/vault', addSecretLinks);

// GET  /api/admin/products/:id/vault  – vault stats for one product
router.get('/products/:id/vault', getProductVaultStats);

/* ─── Vault aggregate stats ──────────────────── */
// GET /api/admin/vault-stats
router.get('/vault-stats', getVaultStats);

/* ─── User routes ────────────────────────────── */
// GET  /api/admin/users
router.get('/users', getAllUsers);

// POST /api/admin/users/:id/topup
router.post('/users/:id/topup', topUpUser);

module.exports = router;
