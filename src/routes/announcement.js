'use strict';

const express = require('express');
const router = express.Router();
const { getAnnouncement, updateAnnouncement } = require('../controllers/announcementController');
const { protect, adminOnly } = require('../middleware/auth');

// Public: lấy thông tin hiển thị popup
router.get('/', getAnnouncement);

// Admin: cập nhật popup
router.put('/', protect, adminOnly, updateAnnouncement);

module.exports = router;
