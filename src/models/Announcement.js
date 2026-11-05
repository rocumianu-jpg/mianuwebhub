'use strict';

const mongoose = require('mongoose');

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
    },
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
