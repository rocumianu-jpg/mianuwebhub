'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./src/models/User');

const authRoutes = require('./src/routes/auth');
const shopRoutes = require('./src/routes/shop');
const ordersRoutes = require('./src/routes/orders');
const depositRoutes = require('./src/routes/deposit');
const adminRoutes = require('./src/routes/admin');
const categoryRoutes = require('./src/routes/category');
const geminiRoutes = require('./src/routes/gemini');
const announcementRoutes = require('./src/routes/announcement');
const notificationRoutes = require('./src/routes/notifications');
const feedbackRoutes = require('./src/routes/feedback');
const taskRoutes = require('./src/routes/tasks');
const giftCodeRoutes = require('./src/routes/giftcodes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

const allowedOrigins = [
  'https://mianuwebhub.store',
  'https://www.mianuwebhub.store',
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Cho phép requests không có origin (như curl, mobile apps, server-to-server Webhooks)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin === 'https://mianuwebhub.store' ||
        origin.endsWith('.mianuwebhub.store') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Các Routes chính
app.use('/api/auth', authRoutes);
app.use('/api/shop', shopRoutes);         // Đảm bảo có dòng này
app.use('/api/orders', ordersRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/announcement', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/giftcodes', giftCodeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/digital-shop';

// Tự động cấp mã định danh nạp tiền dạng 6 số (000001, 000002...) cho các user cũ chưa có
async function ensureDepositCodes() {
  try {
    const usersWithoutCode = await User.find({
      $or: [{ depositCode: { $exists: false } }, { depositCode: null }, { depositCode: '' }],
    }).sort({ createdAt: 1 });

    if (usersWithoutCode.length === 0) return;

    const lastUser = await User.findOne({ depositCode: { $exists: true, $ne: '' } })
      .sort({ depositCode: -1 })
      .select('depositCode');

    let currentNumber = 0;
    if (lastUser && lastUser.depositCode) {
      const parsed = parseInt(lastUser.depositCode, 10);
      if (!isNaN(parsed)) currentNumber = parsed;
    }

    for (const u of usersWithoutCode) {
      currentNumber += 1;
      u.depositCode = String(currentNumber).padStart(6, '0');
      await u.save();
      console.log(`[DepositCode] Đã cấp mã ${u.depositCode} cho tài khoản "${u.username}"`);
    }
  } catch (err) {
    console.error('[DepositCode Error]:', err.message);
  }
}

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await ensureDepositCodes();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });