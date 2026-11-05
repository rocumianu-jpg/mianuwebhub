'use strict';

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
    },
    secretLink: {
      type: String,
      default: '',
    },
    pricePaid: {
      type: Number,
      required: [true, 'pricePaid is required'],
    },
    productTitle: {
      type: String,
      required: [true, 'productTitle is required'],
    },
    // Trạng thái đơn: pending (Chờ xử lý), processing (Đang làm), completed (Thành công), cancelled (Đã hủy)
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending',
    },
    // Ghi chú lý do hủy từ Admin
    cancelNote: {
      type: String,
      default: '',
      trim: true,
    },
    // Thông tin yêu cầu từ khách hàng (Link profile, Email...)
    customerNote: {
      type: String,
      default: '',
      trim: true,
    },
    // Cờ đánh dấu đã hoàn tiền ví hay chưa
    refunded: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);