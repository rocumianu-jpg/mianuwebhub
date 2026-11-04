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
  getAllOrders,
  updateOrderStatus,
} = require('../controllers/adminController');

const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

/* ─── Product routes ─────────────────────────── */
router.get('/products', getAllProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

/* ─── SecretVault routes ─────────────────────── */
router.post('/vault/:id/links', addVaultLinks);
router.post('/products/:id/vault', addVaultLinks);
router.get('/products/:id/vault', getProductVaultStats);
router.get('/vault/stats', getVaultStats);
router.get('/vault-stats', getVaultStats);

/* ─── User routes ────────────────────────────── */
router.get('/users', getAllUsers);
router.post('/users/:id/topup', topUpUser);

/* ─── Order management & Refund routes ───────── */
router.get('/orders', getAllOrders);
router.put('/orders/:id/status', updateOrderStatus);

module.exports = router;