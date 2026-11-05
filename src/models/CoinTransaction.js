'use strict';

const mongoose = require('mongoose');

const coinTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    // task_reward (Thưởng vượt link), purchase (Mua sản phẩm), admin_adjustment (Admin chỉnh), refund (Hoàn tiền coin)
    type: {
      type: String,
      enum: ['task_reward', 'purchase', 'admin_adjustment', 'refund'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
    },
    balanceAfter: {
      type: Number,
      required: [true, 'balanceAfter is required'],
      min: [0, 'balanceAfter cannot be negative'],
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    taskName: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CoinTransaction', coinTransactionSchema);
