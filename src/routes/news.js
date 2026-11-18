'use strict';

const express = require('express');
const router = express.Router();
const {
  getArticles,
  getArticleBySlug,
  adminGetArticles,
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
} = require('../controllers/newsController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────
router.get('/', getArticles);
router.get('/:slug', getArticleBySlug);

// ─── ADMIN CMS ROUTES ───────────────────────────────────────────────────────
router.get('/admin/all', protect, adminOnly, adminGetArticles);
router.post('/admin', protect, adminOnly, adminCreateArticle);
router.put('/admin/:id', protect, adminOnly, adminUpdateArticle);
router.delete('/admin/:id', protect, adminOnly, adminDeleteArticle);

module.exports = router;
