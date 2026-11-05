'use strict';

const express = require('express');
const router = express.Router();

const {
  startGemini,
  getQueueStatus,
  verifyGemini,
  cancelQueue,
} = require('../controllers/geminiController');
const { protect } = require('../middleware/auth');

// POST /api/gemini/start (Yêu cầu đăng nhập)
router.post('/start', protect, startGemini);

// GET /api/gemini/queue-status (Yêu cầu đăng nhập)
router.get('/queue-status', protect, getQueueStatus);

// POST /api/gemini/verify (Yêu cầu đăng nhập)
router.post('/verify', protect, verifyGemini);

// POST /api/gemini/cancel-queue (Yêu cầu đăng nhập)
router.post('/cancel-queue', protect, cancelQueue);

module.exports = router;