'use strict';

const mongoose = require('mongoose');

const themeSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global_theme',
      unique: true,
      index: true,
    },
    bgImageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    bgImageEnabled: {
      type: Boolean,
      default: false,
    },
    bgOverlayOpacity: {
      type: Number,
      default: 60,
      min: 0,
      max: 90,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ThemeSetting', themeSettingSchema);
