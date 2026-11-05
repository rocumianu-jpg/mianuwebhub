'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/** Generate a signed JWT for a user document */
const signToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Tự động sinh mã định danh nạp tiền dạng 6 chữ số tăng dần (000001, 000002, ...)
    const lastUser = await User.findOne({ depositCode: { $exists: true, $ne: '' } })
      .sort({ depositCode: -1 })
      .select('depositCode');

    let nextNumber = 1;
    if (lastUser && lastUser.depositCode) {
      const parsed = parseInt(lastUser.depositCode, 10);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }
    const depositCode = String(nextNumber).padStart(6, '0');

    const user = await User.create({ username, passwordHash, depositCode });

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        email: user.email || '',
        role: user.role,
        balance: user.balance,
        depositCode: user.depositCode,
        isBanned: false,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: user.banReason
          ? `Tài khoản của bạn đã bị khóa: ${user.banReason}`
          : 'Tài khoản của bạn đã bị khóa bởi Quản trị viên.',
        isBanned: true,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken(user);

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        email: user.email || '',
        role: user.role,
        balance: user.balance,
        depositCode: user.depositCode,
        isBanned: user.isBanned || false,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = (req, res) => {
  const user = req.user;
  return res.json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      displayName: user.displayName || '',
      avatarUrl: user.avatarUrl || '',
      email: user.email || '',
      role: user.role,
      balance: user.balance,
      depositCode: user.depositCode,
      isBanned: user.isBanned || false,
    },
  });
};

/**
 * PUT /api/auth/profile
 * Cập nhật thông tin tài khoản cá nhân: username, email, displayName, avatarUrl
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { username, email, displayName, avatarUrl } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }

    if (username && username.toLowerCase().trim() !== user.username) {
      const cleanUsername = username.toLowerCase().trim();
      const existing = await User.findOne({ username: cleanUsername, _id: { $ne: userId } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Tên đăng nhập này đã có người sử dụng.' });
      }
      user.username = cleanUsername;
    }

    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (displayName !== undefined) user.displayName = displayName.trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl.trim();

    await user.save();

    return res.json({
      success: true,
      message: 'Cập nhật thông tin cá nhân thành công!',
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        email: user.email || '',
        role: user.role,
        balance: user.balance,
        depositCode: user.depositCode,
        isBanned: user.isBanned,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/change-password
 * Đổi mật khẩu tài khoản
 */
const changePassword = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu cũ và mật khẩu mới.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
};
