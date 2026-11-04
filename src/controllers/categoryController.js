'use strict';

const Category = require('../models/Category');

/**
 * GET /api/categories
 * Lấy danh sách danh mục (cung cấp cả dạng phẳng và dạng cây cha-con)
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ order: 1, createdAt: 1 });

    // Xây dựng cấu trúc cây (tree) cha -> con
    const parents = categories.filter((c) => !c.parent);
    const tree = parents.map((parent) => {
      const children = categories.filter(
        (c) => c.parent && c.parent.toString() === parent._id.toString()
      );
      return {
        ...parent.toObject(),
        children,
      };
    });

    return res.json({
      success: true,
      categories,
      tree,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/categories
 * Admin tạo mới danh mục cha hoặc danh mục con
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, icon, parent, order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên danh mục là bắt buộc',
      });
    }

    const parentId = parent && parent !== 'null' && parent !== '' ? parent : null;

    const category = await Category.create({
      name: name.trim(),
      icon: icon ? icon.trim() : 'ListTree',
      parent: parentId,
      order: Number(order) || 0,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo danh mục thành công',
      category,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/categories/:id
 * Admin cập nhật danh mục
 */
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, icon, parent, order, isActive } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy danh mục',
      });
    }

    if (name !== undefined) category.name = name.trim();
    if (icon !== undefined) category.icon = icon.trim();
    if (parent !== undefined) {
      category.parent = parent && parent !== 'null' && parent !== '' ? parent : null;
    }
    if (order !== undefined) category.order = Number(order) || 0;
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    await category.save();

    return res.json({
      success: true,
      message: 'Cập nhật danh mục thành công',
      category,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/categories/:id
 * Admin xóa danh mục (và xóa luôn các danh mục con phụ thuộc)
 */
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy danh mục',
      });
    }

    // Xóa các danh mục con thuộc danh mục này
    await Category.deleteMany({ parent: id });

    return res.json({
      success: true,
      message: 'Đã xóa danh mục và các danh mục con liên quan',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};