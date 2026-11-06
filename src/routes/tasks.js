'use strict';

const express = require('express');
const router = express.Router();
const {
  getPublicTasks,
  generateTaskLink,
  startTask,
  handlePostback,
  getCoinHistory,
  adminGetTasks,
  adminCreateTask,
  adminUpdateTask,
  adminDeleteTask,
  seedDefaultTasks,
  adminSimulatePostback,
} = require('../controllers/taskController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── WEBHOOK POSTBACK (PUBLIC) ──────────────────────────────────────────────
// Cho phép cả GET và POST để tương thích với tất cả các mạng rút gọn / traffic
router.get('/postback', handlePostback);
router.post('/postback', handlePostback);

// ─── USER PROTECTED ROUTES ──────────────────────────────────────────────────
router.get('/', protect, getPublicTasks);
router.get('/generate', protect, generateTaskLink);
router.get('/:id/generate', protect, generateTaskLink);
router.post('/:id/start', protect, startTask);
router.get('/history', protect, getCoinHistory);

// ─── ADMIN ROUTES ───────────────────────────────────────────────────────────
router.get('/admin/list', protect, adminOnly, adminGetTasks);
router.post('/admin', protect, adminOnly, adminCreateTask);
router.put('/admin/:id', protect, adminOnly, adminUpdateTask);
router.delete('/admin/:id', protect, adminOnly, adminDeleteTask);
router.post('/admin/seed', protect, adminOnly, seedDefaultTasks);
router.post('/admin/simulate', protect, adminOnly, adminSimulatePostback);

module.exports = router;
