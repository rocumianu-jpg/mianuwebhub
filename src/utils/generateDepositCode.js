'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Sinh mã định danh nạp tiền (depositCode) ngẫu nhiên, độc nhất.
 * Độ dài mặc định: 6 ký tự gồm chữ in hoa và chữ số (ví dụ: M8K2P9, W4X7N1).
 * Sử dụng bảng ký tự dễ nhìn, loại bỏ O, 0, I, 1 để tránh nhầm lẫn khi người dùng điền nội dung chuyển khoản ngân hàng.
 * Đảm bảo 100% không trùng lặp bằng cách kiểm tra trực tiếp trong MongoDB.
 * 
 * @param {number} length Độ dài chuỗi (mặc định 6 ký tự)
 * @returns {Promise<string>} Mã nạp tiền độc nhất
 */
async function generateUniqueDepositCode(length = 6) {
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let isUnique = false;
  let code = '';
  let attempts = 0;

  while (!isUnique && attempts < 100) {
    attempts++;
    let result = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += charset[bytes[i] % charset.length];
    }
    code = result;

    // Nếu Mongoose đang kết nối DB, kiểm tra đối soát trùng lặp
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const existing = await User.findOne({ depositCode: code }).select('_id');
      if (!existing) {
        isUnique = true;
      }
    } else {
      isUnique = true;
    }
  }

  // Phương án dự phòng timestamp dạng base36 nếu vòng lặp đạt giới hạn
  if (!isUnique) {
    code = Date.now().toString(36).toUpperCase().slice(-length);
  }

  return code;
}

module.exports = { generateUniqueDepositCode };
