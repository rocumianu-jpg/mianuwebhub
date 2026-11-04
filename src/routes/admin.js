'use strict';

const express = require('express');
const router = express.Router();

const {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addVaultLinks,
  getProductVaultStats,
  getVaultStats,
  getAllUsers,
  topUpUser,
} = require('../controllers/adminController');

const { protect, adminOnly } = require('../middleware/auth');

// Toàn bộ route admin đều cần đăng nhập và có quyền admin
router.use(protect, adminOnly);

/* ─── Product routes ─────────────────────────── */
router.get('/products', getAllProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

/* ─── SecretVault routes ─────────────────────── */
// Route nạp link mà Frontend đang gọi
router.post('/vault/:id/links', addVaultLinks);
router.post('/products/:id/vault', addVaultLinks); // alias
router.get('/products/:id/vault', getProductVaultStats);
router.get('/vault/stats', getVaultStats);
router.get('/vault-stats', getVaultStats); // alias

/* ─── User routes ────────────────────────────── */
router.get('/users', getAllUsers);
router.post('/users/:id/topup', topUpUser);

module.exports = router;