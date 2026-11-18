'use strict';

const express = require('express');
const router = express.Router();
const {
  getMyTickets,
  getTicketById,
  createTicket,
  replyTicket,
  closeTicket,
  adminGetAllTickets,
} = require('../controllers/ticketController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── USER & COMMON ROUTES (Yêu cầu đăng nhập) ────────────────────────────────
router.get('/', protect, getMyTickets);
router.post('/', protect, createTicket);
router.get('/:id', protect, getTicketById);
router.post('/:id/message', protect, replyTicket);
router.post('/:id/close', protect, closeTicket);

// ─── ADMIN ROUTES (Yêu cầu quyền Admin) ──────────────────────────────────────
router.get('/admin/all', protect, adminOnly, adminGetAllTickets);

module.exports = router;
