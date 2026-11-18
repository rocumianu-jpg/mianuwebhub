'use strict';

const Article = require('../models/Article');
const { slugify } = require('../models/Article');

/**
 * GET /api/news
 * Khách và người dùng lấy danh sách bài viết đã xuất bản
 */
const getArticles = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 12 } = req.query;

    const query = { isPublished: true };

    if (category && category !== 'ALL') {
      query.category = category;
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { summary: { $regex: q, $options: 'i' } },
      ];
    }

    const currentPage = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.max(1, parseInt(limit) || 12);
    const skip = (currentPage - 1) * pageLimit;

    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .select('-content'), // Danh sách không cần load content HTML nặng
      Article.countDocuments(query),
    ]);

    return res.json({
      success: true,
      articles,
      total,
      page: currentPage,
      totalPages: Math.ceil(total / pageLimit) || 1,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/news/:slug
 * Xem chi tiết bài viết theo Slug hoặc ID
 */
const getArticleBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const query = slug.match(/^[0-9a-fA-F]{24}$/)
      ? { $or: [{ slug }, { _id: slug }] }
      : { slug };

    const article = await Article.findOne(query);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết yêu cầu',
      });
    }

    // Tăng lượt xem (views)
    article.views += 1;
    await article.save();

    return res.json({
      success: true,
      article,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/news/admin/all
 * Admin lấy danh sách toàn bộ bài viết (bao gồm cả bản nháp)
 */
const adminGetArticles = async (req, res, next) => {
  try {
    const { search, category } = req.query;

    const query = {};
    if (category && category !== 'ALL') {
      query.category = category;
    }
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } },
      ];
    }

    const articles = await Article.find(query).sort({ createdAt: -1 });

    return res.json({
      success: true,
      articles,
      total: articles.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/news/admin
 * Admin tạo bài viết mới
 */
const adminCreateArticle = async (req, res, next) => {
  try {
    const { title, slug, thumbnail, summary, content, category, author, isPublished } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tiêu đề bài viết là bắt buộc',
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung bài viết là bắt buộc',
      });
    }

    let finalSlug = slug && slug.trim() ? slugify(slug.trim()) : slugify(title.trim());

    // Kiểm tra trùng slug
    const existing = await Article.findOne({ slug: finalSlug });
    if (existing) {
      finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const article = await Article.create({
      title: title.trim(),
      slug: finalSlug,
      thumbnail: thumbnail ? thumbnail.trim() : '',
      summary: summary ? summary.trim() : '',
      content: content.trim(),
      category: category && category.trim() ? category.trim() : 'Tin Tức Chung',
      author: author && author.trim() ? author.trim() : (req.user?.username || 'Ban Quản Trị'),
      isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
      publishedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo bài viết mới thành công',
      article,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/news/admin/:id
 * Admin chỉnh sửa bài viết
 */
const adminUpdateArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, slug, thumbnail, summary, content, category, author, isPublished } = req.body;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết',
      });
    }

    if (title !== undefined) article.title = title.trim();
    if (thumbnail !== undefined) article.thumbnail = thumbnail.trim();
    if (summary !== undefined) article.summary = summary.trim();
    if (content !== undefined) article.content = content.trim();
    if (category !== undefined) article.category = category.trim();
    if (author !== undefined) article.author = author.trim();
    if (isPublished !== undefined) article.isPublished = Boolean(isPublished);

    if (slug && slug.trim()) {
      const sanitizedSlug = slugify(slug.trim());
      const existing = await Article.findOne({ slug: sanitizedSlug, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Đường dẫn (slug) này đã tồn tại, vui lòng chọn tên khác',
        });
      }
      article.slug = sanitizedSlug;
    }

    await article.save();

    return res.json({
      success: true,
      message: 'Cập nhật bài viết thành công',
      article,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/news/admin/:id
 * Admin xóa bài viết
 */
const adminDeleteArticle = async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await Article.findByIdAndDelete(id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết cần xóa',
      });
    }

    return res.json({
      success: true,
      message: 'Đã xóa bài viết thành công',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getArticles,
  getArticleBySlug,
  adminGetArticles,
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
};
