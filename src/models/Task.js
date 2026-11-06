'use strict';

const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Task name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    rewardCoins: {
      type: Number,
      required: [true, 'Reward coins is required'],
      default: 10,
      min: [1, 'Reward coins must be at least 1'],
    },
    dailyLimit: {
      type: Number,
      required: [true, 'Daily limit is required'],
      default: 5,
      min: [1, 'Daily limit must be at least 1'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Lớp Anti-Cheat bẫy thời gian: số giây tối thiểu để được tính là hợp lệ (mặc định 30s)
    minDurationSeconds: {
      type: Number,
      default: 30,
      min: [5, 'Min duration must be at least 5 seconds'],
    },
    // URL chuyển hướng hoặc template (hỗ trợ {token}, {userId})
    targetUrl: {
      type: String,
      default: '',
      trim: true,
    },
    guideText: {
      type: String,
      default: '',
      trim: true,
    },
    icon: {
      type: String,
      default: 'Link',
      trim: true,
    },
    // Loại cơ chế API: standard (Webhook tĩnh) | phienchoso_json (Developer API PhienChoSo) | lentop_json (Developer API LenTop)
    apiType: {
      type: String,
      enum: ['standard', 'phienchoso_json', 'lentop_json'],
      default: 'standard',
    },
    // API Token của Admin từ PhienChoSo / LenTop (hoặc mạng tương đương)
    apiToken: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
