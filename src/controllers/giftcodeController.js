'use strict';

const GiftCode = require('../models/GiftCode');
const User = require('../models/User');
const CoinTransaction = require('../models/CoinTransaction');

// ─── USER REDEEM GIFT CODE ──────────────────────────────────────────────────
const redeemGiftCode = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { code } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã đổi thưởng hợp lệ.',
      });
    }

    const cleanCode = code.trim().toUpperCase();

    const giftCode = await GiftCode.findOne({ code: cleanCode });

    if (!giftCode) {
      return res.status(404).json({
        success: false,
        message: 'Mã đổi thưởng không tồn tại trên hệ thống.',
      });
    }

    if (!giftCode.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Mã đổi thưởng này hiện đang tạm khóa hoặc đã bị vô hiệu hóa.',
      });
    }

    if (giftCode.expireAt && new Date() > new Date(giftCode.expireAt)) {
      return res.status(400).json({
        success: false,
        message: `Mã đổi thưởng đã hết hạn sử dụng vào ngày ${new Date(giftCode.expireAt).toLocaleDateString('vi-VN')}.`,
      });
    }

    if (giftCode.usedCount >= giftCode.maxUses) {
      return res.status(400).json({
        success: false,
        message: 'Mã đổi thưởng đã hết số lượt sử dụng tối đa.',
      });
    }

    const alreadyUsed = giftCode.usersUsed.some(
      (uId) => uId.toString() === userId.toString()
    );

    if (alreadyUsed) {
      return res.status(400).json({
        success: false,
        message: 'Bạn đã sử dụng mã đổi thưởng này rồi. Mỗi tài khoản chỉ được dùng 1 lần.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin tài khoản người dùng.',
      });
    }

    let rewardText = '';
    const rewardValue = Number(giftCode.rewardValue) || 0;

    if (giftCode.rewardType === 'coin') {
      user.coinBalance = (user.coinBalance || 0) + rewardValue;
      rewardText = `+${rewardValue.toLocaleString('vi-VN')} Coin 🪙`;

      // Tạo lịch sử giao dịch Coin
      await CoinTransaction.create({
        userId: user._id,
        type: 'gift_code',
        amount: rewardValue,
        balanceAfter: user.coinBalance,
        description: `Nhập mã quà tặng: ${giftCode.code}`,
      });
    } else if (giftCode.rewardType === 'money') {
      user.balance = (user.balance || 0) + rewardValue;
      rewardText = `+${rewardValue.toLocaleString('vi-VN')} đ`;
    } else {
      // voucher
      user.coinBalance = (user.coinBalance || 0) + rewardValue;
      rewardText = `+${rewardValue.toLocaleString('vi-VN')} Coin (Voucher)`;

      await CoinTransaction.create({
        userId: user._id,
        type: 'gift_code',
        amount: rewardValue,
        balanceAfter: user.coinBalance,
        description: `Voucher quà tặng: ${giftCode.code}`,
      });
    }

    // Cập nhật GiftCode
    giftCode.usedCount += 1;
    giftCode.usersUsed.push(user._id);

    await user.save();
    await giftCode.save();

    return res.json({
      success: true,
      message: `🎉 Chúc mừng bạn đã đổi mã thành công! Bạn nhận được ${rewardText}.`,
      rewardType: giftCode.rewardType,
      rewardValue,
      newBalance: user.balance,
      newCoinBalance: user.coinBalance,
    });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN GIFT CODE CONTROLLERS ─────────────────────────────────────────────
const getAllGiftCodes = async (req, res, next) => {
  try {
    const giftCodes = await GiftCode.find()
      .populate('usersUsed', 'username email')
      .sort({ createdAt: -1 });
    return res.json({ success: true, giftCodes });
  } catch (err) {
    next(err);
  }
};

const createGiftCode = async (req, res, next) => {
  try {
    const { code, rewardType, rewardValue, maxUses, expireAt, description, isActive } = req.body;
    if (!code || rewardValue === undefined || rewardValue === null) {
      return res.status(400).json({ success: false, message: 'Mã và giá trị thưởng là bắt buộc' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await GiftCode.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Mã đổi thưởng này đã tồn tại trên hệ thống' });
    }

    const giftCode = await GiftCode.create({
      code: cleanCode,
      rewardType: ['coin', 'money', 'voucher'].includes(rewardType) ? rewardType : 'coin',
      rewardValue: Number(rewardValue),
      maxUses: maxUses ? Math.max(1, Number(maxUses)) : 1,
      expireAt: expireAt ? new Date(expireAt) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      description: description ? description.trim() : '',
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo mã đổi thưởng mới thành công!',
      giftCode,
    });
  } catch (err) {
    next(err);
  }
};

const updateGiftCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, rewardType, rewardValue, maxUses, expireAt, isActive, description } = req.body;

    const giftCode = await GiftCode.findById(id);
    if (!giftCode) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mã đổi thưởng' });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode !== giftCode.code) {
        const existing = await GiftCode.findOne({ code: cleanCode });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Mã đổi thưởng mới đã tồn tại' });
        }
        giftCode.code = cleanCode;
      }
    }

    if (rewardType !== undefined) {
      giftCode.rewardType = ['coin', 'money', 'voucher'].includes(rewardType) ? rewardType : giftCode.rewardType;
    }
    if (rewardValue !== undefined) giftCode.rewardValue = Number(rewardValue);
    if (maxUses !== undefined) giftCode.maxUses = Math.max(1, Number(maxUses));
    if (expireAt !== undefined) giftCode.expireAt = expireAt ? new Date(expireAt) : null;
    if (isActive !== undefined) giftCode.isActive = Boolean(isActive);
    if (description !== undefined) giftCode.description = description.trim();

    await giftCode.save();

    return res.json({
      success: true,
      message: 'Cập nhật mã đổi thưởng thành công!',
      giftCode,
    });
  } catch (err) {
    next(err);
  }
};

const deleteGiftCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await GiftCode.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mã đổi thưởng để xóa' });
    }
    return res.json({ success: true, message: 'Đã xóa mã đổi thưởng thành công' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  redeemGiftCode,
  getAllGiftCodes,
  createGiftCode,
  updateGiftCode,
  deleteGiftCode,
};
