'use strict';

const mongoose = require('mongoose');

/**
 * Sub-schema cho từng biến thể (Gói dịch vụ - Decao)
 */
const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên gói dịch vụ là bắt buộc'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Giá gói dịch vụ là bắt buộc'],
      min: [0, 'Giá không thể âm'],
    },
    originalPrice: {
      type: Number,
      default: 0,
      min: [0, 'Giá gốc không thể âm'],
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Số lượng kho không thể âm'],
    },
    isCoinAllowed: {
      type: Boolean,
      default: false,
    },
    coinPrice: {
      type: Number,
      default: 0,
      min: [0, 'Giá Coin không thể âm'],
    },
    // Kho link / key dành riêng cho biến thể này
    secretLinks: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: false }
);

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
    // Giá mặc định (đối với sản phẩm đơn lẻ hoặc giá khởi điểm hiển thị)
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
    // Phân loại: instant (Tự động / Có sẵn - nhả link ngay) | manual (Xử lý thủ công) | auto_api (Bắn Webhook bên thứ 3)
    productType: {
      type: String,
      enum: ['instant', 'manual', 'bot_gemini', 'auto_api'],
      default: 'instant',
    },
    // Mô tả chi tiết (Bài viết chi tiết, chế độ bảo hành, hướng dẫn sử dụng)
    detailedDescription: {
      type: String,
      default: '',
    },
    // Yêu cầu thông tin từ người mua trước khi thanh toán (vd: Link profile, Email, Tên nhân vật Roblox...)
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
    // Mảng chứa các link/key trong kho bí mật gắn trực tiếp vào sản phẩm đơn lẻ
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
    // Sản phẩm độc quyền chỉ đổi bằng Coin (Cấm mua bằng tiền mặt VNĐ)
    isCoinOnly: {
      type: Boolean,
      default: false,
    },
    // Đánh dấu sản phẩm bán chạy nổi bật (Best Seller)
    isBestSeller: {
      type: Boolean,
      default: false,
    },

    // ─── TÍNH NĂNG MỚI V2.5: SẢN PHẨM ĐA GÓI / BIẾN THỂ (VARIANTS) ───────────
    hasVariants: {
      type: Boolean,
      default: false,
    },
    variants: [variantSchema],

    // ─── TÍNH NĂNG MỚI V2.5: TÍCH HỢP API THỨ 3 (AUTO API WEBHOOK) ───────────
    // Dùng cho Auto-Robux, Auto-Redeem, Server game tự động...
    apiIntegration: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      endpointUrl: {
        type: String,
        default: '',
        trim: true,
      },
      method: {
        type: String,
        enum: ['GET', 'POST'],
        default: 'POST',
      },
      apiKey: {
        type: String,
        default: '',
        trim: true,
      },
      // Headers tùy chỉnh (vd: Bearer token)
      customHeaders: {
        type: Map,
        of: String,
        default: () => new Map(),
      },
      // Ghi chú hoặc template payload
      payloadTemplate: {
        type: String,
        default: '',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
