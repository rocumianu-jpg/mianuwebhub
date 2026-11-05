'use strict';

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Product title is required'],
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Phân loại: instant (Tự động / Có sẵn - nhả link ngay) | manual (Xử lý thủ công) | bot_gemini (Tự động Telegram Bot)
    productType: {
      type: String,
      enum: ['instant', 'manual', 'bot_gemini'],
      default: 'instant',
    },
    // Mô tả chi tiết (Bài viết chi tiết, chế độ bảo hành, hướng dẫn sử dụng)
    detailedDescription: {
      type: String,
      default: '',
    },
    // Yêu cầu thông tin từ người mua trước khi thanh toán (vd: Link profile, Email...)
    customRequirementLabel: {
      type: String,
      default: '',
      trim: true,
    },
    // Nền tảng (Facebook, TikTok, Instagram, YouTube, Telegram, Shopee, Discord, Software...)
    platform: {
      type: String,
      default: 'Khác',
      trim: true,
    },
    // Danh mục con (View Người Thật, Theo Dõi Việt, Tym Dạng Mới, Tool / Script...)
    subCategory: {
      type: String,
      default: 'Mặc định',
      trim: true,
    },
    // Vật phẩm / Link bí mật đơn lẻ nhập trực tiếp lúc thêm/sửa sản phẩm
    secretItem: {
      type: String,
      default: '',
      trim: true,
    },
    // Mảng chứa các link/key trong kho bí mật gắn trực tiếp vào sản phẩm
    secretLinks: [
      {
        type: String,
        trim: true,
      },
    ],
    // Hỗ trợ thanh toán bằng Coin
    isCoinAllowed: {
      type: Boolean,
      default: false,
    },
    coinPrice: {
      type: Number,
      default: 0,
      min: [0, 'Coin price cannot be negative'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);