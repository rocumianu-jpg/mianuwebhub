'use strict';

const mongoose = require('mongoose');

/**
 * Schema lưu trữ lịch sử giao dịch nạp thẻ cào tự động qua cổng TheSieuRe (TSR)
 */
const cardTopupSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'UserId là bắt buộc'],
      index: true,
    },
    // Mã yêu cầu độc nhất gửi sang TheSieuRe (request_id)
    requestId: {
      type: String,
      required: [true, 'RequestId là bắt buộc'],
      unique: true,
      index: true,
      trim: true,
    },
    // Nhà mạng (VIETTEL, VINAPHONE, GARENA, ZING)
    telco: {
      type: String,
      required: [true, 'Nhà mạng là bắt buộc'],
      uppercase: true,
      trim: true,
      enum: ['VIETTEL', 'VINAPHONE', 'GARENA', 'ZING'],
    },
    // Mệnh giá người dùng khai báo lúc gửi (VND)
    declaredAmount: {
      type: Number,
      required: [true, 'Mệnh giá khai báo là bắt buộc'],
      min: [5000, 'Mệnh giá tối thiểu là 5.000đ'],
    },
    // Mệnh giá thực của thẻ do TSR thẩm định trả về (VND)
    realAmount: {
      type: Number,
      default: 0,
    },
    // Phần trăm phí gạch thẻ áp dụng (%)
    feePercent: {
      type: Number,
      default: 0,
    },
    // Số tiền thực nhận sau chiết khấu cộng vào số dư User (balance VND)
    receivedAmount: {
      type: Number,
      default: 0,
    },
    // Số Serial của thẻ cào
    serial: {
      type: String,
      required: [true, 'Số Serial thẻ là bắt buộc'],
      trim: true,
    },
    // Mã thẻ (PIN)
    code: {
      type: String,
      required: [true, 'Mã thẻ (PIN) là bắt buộc'],
      trim: true,
    },
    // Phương thức nạp: auto_tsr (TheSieuRe tự động) hoặc manual (Nạp thủ công chờ Admin duyệt)
    method: {
      type: String,
      enum: ['auto_tsr', 'manual'],
      default: 'auto_tsr',
      index: true,
    },
    // Trạng thái giao dịch:
    // pending: Đang chờ TSR duyệt tự động
    // pending_manual: Đang chờ Quản trị viên duyệt thủ công
    // completed: Nạp thẻ thành công, đã cộng tiền
    // wrong_amount: Nạp thẻ sai mệnh giá khai báo
    // failed: Thẻ lỗi, sai mã/seri hoặc bị Admin từ chối
    status: {
      type: String,
      enum: ['pending', 'pending_manual', 'completed', 'wrong_amount', 'failed'],
      default: 'pending',
      index: true,
    },
    // Thông tin Admin duyệt (nếu là nạp thủ công)
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    // Mã giao dịch phía TheSieuRe (trans_id)
    tsrTransId: {
      type: String,
      default: '',
      trim: true,
    },
    // Thông báo chi tiết hoặc lý do từ TSR
    message: {
      type: String,
      default: 'Đang chờ xử lý từ nhà mạng...',
      trim: true,
    },
    // Dữ liệu phản hồi thô từ TSR phục vụ đối soát
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CardTopup', cardTopupSchema);
