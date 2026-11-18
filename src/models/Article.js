'use strict';

const mongoose = require('mongoose');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // Tách dấu tiếng Việt
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9 -]/g, '') // Bỏ ký tự đặc biệt
    .replace(/\s+/g, '-') // Đổi khoảng trắng thành gạch nối
    .replace(/-+/g, '-'); // Tránh nhiều gạch nối liền nhau
}

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề bài viết là bắt buộc'],
      trim: true,
      maxlength: 300,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    thumbnail: {
      type: String,
      default: '',
      trim: true,
    },
    summary: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    content: {
      type: String,
      required: [true, 'Nội dung bài viết là bắt buộc'],
    },
    category: {
      type: String,
      default: 'Tin Tức Chung',
      trim: true,
      index: true,
    },
    author: {
      type: String,
      default: 'Ban Quản Trị',
      trim: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Tự động tạo slug nếu chưa có trước khi validate
articleSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    const baseSlug = slugify(this.title);
    const suffix = Math.random().toString(36).substring(2, 6);
    this.slug = `${baseSlug}-${suffix}`;
  }
  next();
});

module.exports = mongoose.model('Article', articleSchema);
module.exports.slugify = slugify;
