'use strict';

const mongoose = require('mongoose');

const taskHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'taskId is required'],
      index: true,
    },
    taskName: {
      type: String,
      required: true,
      trim: true,
    },
    sessionToken: {
      type: String,
      required: [true, 'sessionToken is required'],
      unique: true,
      index: true,
    },
    clickTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completeTime: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    // Trạng thái: started (Vừa bấm vượt link), completed (Thành công nhận coin), cheated (Bị bắt gian lận/bypass), rejected (Từ chối vì quá hạn hoặc lỗi)
    status: {
      type: String,
      enum: ['started', 'completed', 'cheated', 'rejected'],
      default: 'started',
      index: true,
    },
    rewardCoins: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TaskHistory', taskHistorySchema);
