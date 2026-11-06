'use strict';

const mongoose = require('mongoose');

const giftCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Mã đổi thưởng là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    // coin (Đổi ra Coin), money (Đổi ra số dư VNĐ), voucher (Voucher giảm giá/đặc biệt)
    rewardType: {
      type: String,
      enum: ['coin', 'money', 'voucher'],
      default: 'coin',
      required: true,
    },
    rewardValue: {
      type: Number,
      required: [true, 'Giá trị phần thưởng là bắt buộc'],
      min: [1, 'Giá trị phần thưởng tối thiểu là 1'],
    },
    maxUses: {
      type: Number,
      default: 1,
      min: [1, 'Số lượt sử dụng tối đa phải từ 1'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, 'Số lượt đã dùng không hợp lệ'],
    },
    usersUsed: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    expireAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GiftCode', giftCodeSchema);
