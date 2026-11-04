'use strict';

const express = require('express');
const router = express.Router();

const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');

const { protect, adminOnly } = require('../middleware/auth');

// GET /api/categories - Lấy danh mục cây và phẳng
router.get('/', getCategories);

// POST /api/categories - Admin tạo danh mục mới
router.post('/', protect, adminOnly, createCategory);

// PUT /api/categories/:id - Admin sửa danh mục
router.put('/:id', protect, adminOnly, updateCategory);

// DELETE /api/categories/:id - Admin xóa danh mục
router.delete('/:id', protect, adminOnly, deleteCategory);

module.exports = router;