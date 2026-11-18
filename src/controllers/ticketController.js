'use strict';

const Ticket = require('../models/Ticket');
const Order = require('../models/Order');

/**
 * GET /api/tickets
 * Lấy danh sách ticket của người dùng hiện tại
 */
const getMyTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .select('-messages');

    return res.json({
      success: true,
      tickets,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/:id
 * Lấy chi tiết ticket kèm toàn bộ lịch sử tin nhắn
 */
const getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate('user', 'username email avatar role')
      .populate('order', 'orderCode amount status createdAt');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ticket yêu cầu',
      });
    }

    // Kiểm tra quyền: Chỉ chủ ticket hoặc Admin mới được xem
    if (
      req.user.role !== 'admin' &&
      ticket.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập ticket này',
      });
    }

    return res.json({
      success: true,
      ticket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets
 * Người dùng mở ticket hỗ trợ mới
 */
const createTicket = async (req, res, next) => {
  try {
    const { topic, subject, orderCode, content, attachments, priority } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tiêu đề ticket là bắt buộc',
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung chi tiết yêu cầu hỗ trợ là bắt buộc',
      });
    }

    let orderId = null;
    let resolvedOrderCode = (orderCode || '').trim();

    if (resolvedOrderCode) {
      // Tìm đơn hàng liên kết nếu có
      const foundOrder = await Order.findOne({
        $or: [
          { orderCode: resolvedOrderCode },
          { _id: resolvedOrderCode.match(/^[0-9a-fA-F]{24}$/) ? resolvedOrderCode : null },
        ],
        user: req.user._id,
      });
      if (foundOrder) {
        orderId = foundOrder._id;
        resolvedOrderCode = foundOrder.orderCode || resolvedOrderCode;
      }
    }

    const initialMessage = {
      sender: 'user',
      senderName: req.user.username || 'Khách hàng',
      senderId: req.user._id,
      content: content.trim(),
      attachments: Array.isArray(attachments)
        ? attachments.filter((a) => typeof a === 'string' && a.trim())
        : [],
      createdAt: new Date(),
    };

    const ticket = await Ticket.create({
      user: req.user._id,
      order: orderId,
      orderCode: resolvedOrderCode,
      topic: topic && topic.trim() ? topic.trim() : 'Hỗ Trợ Chung',
      subject: subject.trim(),
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      status: 'open',
      messages: [initialMessage],
      lastMessageAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: 'Mở ticket hỗ trợ thành công. Kỹ thuật viên sẽ phản hồi sớm nhất!',
      ticket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets/:id/message
 * Gửi tin nhắn trả lời vào ticket (Khách hàng hoặc Admin)
 */
const replyTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, attachments } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung tin nhắn không được để trống',
      });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ticket',
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = ticket.user.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền tham gia cuộc trò chuyện này',
      });
    }

    if (ticket.status === 'closed') {
      if (!isAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Ticket này đã được đóng. Vui lòng mở ticket mới nếu cần hỗ trợ thêm.',
        });
      } else {
        // Admin nhắn lại thì tự động mở lại ticket sang processing
        ticket.status = 'processing';
      }
    }

    const newMessage = {
      sender: isAdmin ? 'admin' : 'user',
      senderName: isAdmin ? 'Hỗ Trợ Kỹ Thuật (Admin)' : req.user.username || 'Khách hàng',
      senderId: req.user._id,
      content: content.trim(),
      attachments: Array.isArray(attachments)
        ? attachments.filter((a) => typeof a === 'string' && a.trim())
        : [],
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    if (isAdmin && ticket.status === 'open') {
      ticket.status = 'processing';
    }

    await ticket.save();

    const updatedTicket = await Ticket.findById(id)
      .populate('user', 'username email avatar role')
      .populate('order', 'orderCode amount status createdAt');

    return res.json({
      success: true,
      message: 'Gửi tin nhắn thành công',
      ticket: updatedTicket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets/:id/close
 * Đóng ticket (Admin hoặc chính chủ)
 */
const closeTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ticket',
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = ticket.user.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền đóng ticket này',
      });
    }

    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = req.user._id;

    // Thêm tin nhắn hệ thống thông báo đóng ticket
    ticket.messages.push({
      sender: 'admin',
      senderName: 'Hệ Thống',
      senderId: req.user._id,
      content: `🔒 Ticket đã được đóng bởi ${isAdmin ? 'Quản trị viên' : 'Khách hàng'}. Vấn đề đã được đánh dấu giải quyết xong.`,
      attachments: [],
      createdAt: new Date(),
    });

    await ticket.save();

    const updatedTicket = await Ticket.findById(id)
      .populate('user', 'username email avatar role')
      .populate('order', 'orderCode amount status createdAt');

    return res.json({
      success: true,
      message: 'Đã đóng ticket thành công',
      ticket: updatedTicket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/admin/all
 * Quản trị viên lấy danh sách toàn bộ ticket trong hệ thống
 */
const adminGetAllTickets = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status && ['open', 'processing', 'closed'].includes(status)) {
      query.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { ticketCode: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
        { orderCode: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } },
      ];
    }

    const tickets = await Ticket.find(query)
      .sort({ updatedAt: -1 })
      .populate('user', 'username email avatar')
      .select('-messages');

    return res.json({
      success: true,
      tickets,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyTickets,
  getTicketById,
  createTicket,
  replyTicket,
  closeTicket,
  adminGetAllTickets,
};
