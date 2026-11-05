'use strict';

const mongoose = require('mongoose');

// Hàm đếm số từ trong văn bản
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

const feedbackSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Mã đơn hàng là bắt buộc'],
      unique: true, // 1 đơn chỉ được đánh giá 1 lần duy nhất
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Thông tin người đánh giá là bắt buộc'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Thông tin sản phẩm là bắt buộc'],
    },
    rating: {
      type: Number,
      required: [true, 'Số sao đánh giá là bắt buộc'],
      min: [1, 'Đánh giá tối thiểu là 1 sao'],
      max: [5, 'Đánh giá tối đa là 5 sao'],
    },
    receivedStatus: {
      type: String,
      default: 'Đã nhận đủ',
      trim: true,
    },
    productQuality: {
      type: String,
      default: 'Rất tốt',
      trim: true,
    },
    deliveryTimeRating: {
      type: String,
      default: 'Siêu nhanh',
      trim: true,
    },
    comment: {
      type: String,
      trim: true,
      validate: {
        validator: function (val) {
          if (!val) return true;
          return countWords(val) <= 200;
        },
        message: 'Nội dung nhận xét không được vượt quá 200 từ.',
      },
    },
    adminReply: {
      type: String,
      default: '',
      trim: true,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
