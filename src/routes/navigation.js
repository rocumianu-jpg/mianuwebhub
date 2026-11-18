'use strict';

const express = require('express');
const router = express.Router();
const {
  getMenu,
  adminUpdateMenu,
  adminResetMenu,
} = require('../controllers/navigationController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────
router.get('/', getMenu);

// ─── ADMIN ROUTES ───────────────────────────────────────────────────────────
router.put('/admin', protect, adminOnly, adminUpdateMenu);
router.post('/admin/reset', protect, adminOnly, adminResetMenu);

module.exports = router;
