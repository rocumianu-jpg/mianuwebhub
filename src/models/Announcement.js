'use strict';

const mongoose = require('mongoose');

/**
 * Schema Popup Thông Báo / Lưu Ý Động (Dynamic Announcement Popup)
 */
const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '⚠️ Lưu ý khi đặt đơn',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Mục tiêu hiển thị:
    // 'all': Tất cả các trang
    // 'home': Chỉ trang chủ (/)
    // 'shop': Trang danh sách cửa hàng (/shop)
    // 'product': Chỉ hiện ở một sản phẩm cụ thể
    // 'custom': Tùy biến theo đường dẫn URL (targetPath)
    displayTarget: {
      type: String,
      enum: ['all', 'home', 'shop', 'product', 'custom'],
      default: 'all',
      index: true,
    },
    // ID sản phẩm cụ thể nếu displayTarget === 'product'
    targetProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    // Đường dẫn tùy biến nếu displayTarget === 'custom' hoặc slug (vd: /shop?platform=Roblox)
    targetPath: {
      type: String,
      default: '',
      trim: true,
    },
    // Danh sách các dòng lưu ý
    items: [
      {
        icon: {
          type: String,
          default: '📌',
          trim: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
