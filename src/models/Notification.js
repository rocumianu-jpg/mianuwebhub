'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['price_change', 'status', 'system', 'personal'],
      default: 'system',
    },
    data: {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      productTitle: String,
      oldPrice: Number,
      newPrice: Number,
      direction: {
        type: String,
        enum: ['up', 'down'],
      },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = thông báo chung cho toàn bộ thành viên
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
