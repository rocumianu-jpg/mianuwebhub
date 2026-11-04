'use strict';

const express = require('express');
const router = express.Router();

const { startGemini, verifyGemini } = require('../controllers/geminiController');
const { protect } = require('../middleware/auth');

// POST /api/gemini/start (Yêu cầu đăng nhập)
router.post('/start', protect, startGemini);

// POST /api/gemini/verify (Yêu cầu đăng nhập)
router.post('/verify', protect, verifyGemini);

module.exports = router;