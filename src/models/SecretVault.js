'use strict';

const mongoose = require('mongoose');

const secretVaultSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
    },
    secretLink: {
      type: String,
      required: [true, 'secretLink is required'],
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecretVault', secretVaultSchema);
