'use strict';

const Category = require('../models/Category');

/**
 * GET /api/categories
 * Lấy danh sách danh mục (cung cấp cả dạng phẳng, dạng cây cha-con, và dạng nhóm đa tầng)
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

    // Module 4: Xây dựng cấu trúc phân nhóm (grouped: Record<string, CategoryTree[]>)
    const grouped = {};
    const groupsSet = new Set();

    tree.forEach((parentItem) => {
      const grp = parentItem.group && parentItem.group.trim() ? parentItem.group.trim() : 'Dịch Vụ Mạng Xã Hội';
      groupsSet.add(grp);
      if (!grouped[grp]) {
        grouped[grp] = [];
      }
      grouped[grp].push(parentItem);
    });

    const groups = Array.from(groupsSet);

    return res.json({
      success: true,
      categories,
      tree,
      grouped,
      groups,
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
    const { name, icon, parent, order, group } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên danh mục là bắt buộc',
      });
    }

    const parentId = parent && parent !== 'null' && parent !== '' ? parent : null;

    let resolvedGroup = group && group.trim() ? group.trim() : '';
    if (parentId && !resolvedGroup) {
      const parentCat = await Category.findById(parentId);
      if (parentCat && parentCat.group) {
        resolvedGroup = parentCat.group;
      }
    }
    if (!resolvedGroup) {
      resolvedGroup = 'Dịch Vụ Mạng Xã Hội';
    }

    const category = await Category.create({
      name: name.trim(),
      group: resolvedGroup,
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
    const { name, icon, parent, order, isActive, group } = req.body;

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
    if (group !== undefined) {
      category.group = group.trim() || 'Dịch Vụ Mạng Xã Hội';
      // Nếu là danh mục cha thì đồng bộ group cho các mục con
      if (!category.parent) {
        await Category.updateMany(
          { parent: category._id },
          { group: category.group }
        );
      }
    }

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