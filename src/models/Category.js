'use strict';

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên danh mục là bắt buộc'],
      trim: true,
    },
    // Chuỗi tên icon (ví dụ: Video, Share2, Camera, Youtube, Send, ShoppingBag, Disc, ShieldCheck, Terminal, Tag...)
    icon: {
      type: String,
      default: 'ListTree',
      trim: true,
    },
    // Danh mục cha (nếu null thì là danh mục cha gốc)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    // Thứ tự sắp xếp hiển thị
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);