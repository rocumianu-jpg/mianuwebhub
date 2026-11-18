'use strict';

const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },
    senderName: {
      type: String,
      default: '',
      trim: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    content: {
      type: String,
      required: [true, 'Nội dung tin nhắn là bắt buộc'],
      trim: true,
    },
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketCode: {
      type: String,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    orderCode: {
      type: String,
      default: '',
      trim: true,
    },
    topic: {
      type: String,
      required: [true, 'Vui lòng chọn chủ đề cần hỗ trợ'],
      trim: true,
      default: 'Hỗ Trợ Chung',
    },
    subject: {
      type: String,
      required: [true, 'Tiêu đề ticket là bắt buộc'],
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ['open', 'processing', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    messages: [ticketMessageSchema],
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Tạo ticketCode tự động trước khi lưu nếu chưa có
ticketSchema.pre('validate', function (next) {
  if (!this.ticketCode) {
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.ticketCode = `TK-${Date.now().toString().slice(-4)}${randomHex}`;
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);
