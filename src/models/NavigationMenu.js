'use strict';

const mongoose = require('mongoose');

const navItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: [true, 'Tên hiển thị mục menu là bắt buộc'],
      trim: true,
    },
    href: {
      type: String,
      required: [true, 'Đường dẫn liên kết là bắt buộc'],
      trim: true,
    },
    icon: {
      type: String,
      default: 'Circle',
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
    isExternal: {
      type: Boolean,
      default: false,
    },
    badge: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true }
);

const navigationMenuSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'main_user_nav',
      unique: true,
      index: true,
    },
    items: [navItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('NavigationMenu', navigationMenuSchema);
