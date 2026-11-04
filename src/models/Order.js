'use strict';

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
    },
    secretLink: {
      type: String,
      required: [true, 'secretLink is required'],
    },
    pricePaid: {
      type: Number,
      required: [true, 'pricePaid is required'],
    },
    productTitle: {
      type: String,
      required: [true, 'productTitle is required'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
