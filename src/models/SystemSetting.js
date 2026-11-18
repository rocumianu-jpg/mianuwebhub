'use strict';

const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'system_config',
      unique: true,
      index: true,
    },
    topupMode: {
      type: String,
      enum: ['auto_tsr', 'manual'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
