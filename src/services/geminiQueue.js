'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const telegramUserbot = require('./telegramUserbot');

/**
 * HỆ THỐNG HÀNG ĐỢI TUẦN TỰ CHO BOT TELEGRAM GEMINI
 * Vì bot Telegram @ngtrungthanhvip_bot chỉ xử lý được 1 người tại 1 thời điểm.
 */

let activeSession = null;
/**
 * activeSession = {
 *   id: string,
 *   userId: string,
 *   orderId: string,
 *   gmail: string,
 *   price: number,
 *   status: 'starting' | 'waiting_otp' | 'verifying' | 'completed' | 'cancelled',
 *   rawPrompt?: string,
 *   link?: string,
 *   error?: string,
 *   startedAt: number,
 *   otpWaitingSince?: number,
 * }
 */

const queue = [];
/**
 * queue = [
 *   {
 *     id: string,
 *     userId: string,
 *     orderId: string,
 *     gmail: string,
 *     price: number,
 *     enqueuedAt: number,
 *   }
 * ]
 */

// Thời gian chờ người dùng nhập OTP tối đa: 3 phút (180 giây)
const OTP_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Xử lý hoàn tiền và cập nhật trạng thái đơn hàng khi thất bại hoặc timeout
 */
async function handleSessionFailure(session, reason) {
  try {
    session.status = 'cancelled';
    session.error = reason;

    if (session.orderId && mongoose.Types.ObjectId.isValid(session.orderId)) {
      const order = await Order.findById(session.orderId);
      if (order) {
        if (!order.refunded) {
          await User.findByIdAndUpdate(order.userId, { $inc: { balance: order.pricePaid } });
          order.refunded = true;
        }
        order.status = 'cancelled';
        order.cancelNote = reason;
        await order.save();
        console.log(`[Gemini Queue] Đã tự động hoàn ${order.pricePaid.toLocaleString('vi-VN')} đ cho đơn #${order._id}. Lý do: ${reason}`);
      }
    }
  } catch (err) {
    console.error('[Gemini Queue] Lỗi khi xử lý hoàn tiền thất bại:', err.message);
  }
}

/**
 * Tự động đẩy người tiếp theo trong hàng đợi vào phiên làm việc với Bot
 */
async function processNext() {
  // Nếu phiên hiện tại vẫn đang bận làm việc với Bot hoặc đang chờ OTP (chưa quá hạn)
  if (activeSession) {
    if (activeSession.status === 'starting' || activeSession.status === 'verifying') {
      return;
    }
    if (activeSession.status === 'waiting_otp') {
      if (activeSession.otpWaitingSince && Date.now() - activeSession.otpWaitingSince > OTP_TIMEOUT_MS) {
        console.warn(`[Gemini Queue] Phiên #${activeSession.orderId} quá 3 phút chưa nhập OTP -> Tự động hủy & chuyển người kế tiếp.`);
        await handleSessionFailure(activeSession, 'Quá thời gian 3 phút chưa nhập OTP. Tiền đã được tự động hoàn vào ví.');
        activeSession = null;
      } else {
        return; // Vẫn đang trong thời gian chờ khách nhập OTP
      }
    } else {
      // completed hoặc cancelled
      activeSession = null;
    }
  }

  if (queue.length === 0) {
    console.log('[Gemini Queue] Hàng đợi trống. Bot sẵn sàng nhận yêu cầu mới.');
    return;
  }

  // Lấy người đứng đầu hàng đợi ra xử lý
  const nextItem = queue.shift();
  activeSession = {
    ...nextItem,
    status: 'starting',
    startedAt: Date.now(),
  };

  console.log(`\n🚀 [Gemini Queue] Bắt đầu phiên kích hoạt cho đơn #${activeSession.orderId} (Email: ${activeSession.gmail}). Còn ${queue.length} người trong hàng đợi.`);

  try {
    const botResult = await telegramUserbot.startGeminiActivation(activeSession.gmail, activeSession.orderId);
    activeSession.status = 'waiting_otp';
    activeSession.rawPrompt = botResult.rawPrompt;
    activeSession.otpWaitingSince = Date.now();
    console.log(`✅ [Gemini Queue] Đơn #${activeSession.orderId} đã nhận prompt OTP từ Bot! Đang chờ khách nhập mã.`);
  } catch (err) {
    console.error(`❌ [Gemini Queue] Khởi động thất bại cho đơn #${activeSession.orderId}:`, err.message);
    await handleSessionFailure(activeSession, err.message || 'Lỗi khi gửi Gmail tới Telegram Bot.');
    activeSession = null;
    // Chuyển ngay sang người kế tiếp
    setImmediate(processNext);
  }
}

/**
 * Đăng ký vào phiên hoặc thêm vào hàng đợi
 */
async function enqueueOrStart(userId, orderId, gmail, price) {
  const queueId = new mongoose.Types.ObjectId().toString();

  // Nếu hiện tại không có ai đang làm việc với Bot -> Bắt đầu ngay
  if (!activeSession) {
    activeSession = {
      id: queueId,
      userId,
      orderId,
      gmail,
      price,
      status: 'starting',
      startedAt: Date.now(),
    };

    try {
      const botResult = await telegramUserbot.startGeminiActivation(gmail, orderId);
      activeSession.status = 'waiting_otp';
      activeSession.rawPrompt = botResult.rawPrompt;
      activeSession.otpWaitingSince = Date.now();

      return {
        status: 'waiting_otp',
        queueId,
        orderId,
        position: 0,
        rawPrompt: botResult.rawPrompt,
        message: 'Bot đã tiếp nhận Gmail và yêu cầu mã OTP.',
      };
    } catch (err) {
      await handleSessionFailure(activeSession, err.message || 'Không thể bắt đầu phiên kích hoạt từ Bot.');
      const errMsg = activeSession.error;
      activeSession = null;
      setImmediate(processNext);
      throw new Error(errMsg);
    }
  } else {
    // Đang có người dùng khác làm việc với Bot -> Thêm vào hàng đợi
    const queueItem = {
      id: queueId,
      userId,
      orderId,
      gmail,
      price,
      enqueuedAt: Date.now(),
    };
    queue.push(queueItem);

    const position = queue.length; // Số thứ tự trong hàng chờ (1, 2, ...)

    console.log(`⏳ [Gemini Queue] Khách #${orderId} (${gmail}) đã vào hàng đợi tại vị trí #${position}.`);

    return {
      status: 'in_queue',
      queueId,
      orderId,
      position,
      totalInQueue: queue.length,
      message: `Hệ thống đang xử lý cho khách trước. Vị trí xếp hàng của bạn: #${position} (Vui lòng giữ nguyên màn hình)...`,
    };
  }
}

/**
 * Lấy trạng thái hàng đợi theo orderId hoặc queueId
 */
function getQueueStatus(orderId, queueId) {
  // 1. Kiểm tra trong phiên đang chạy
  if (activeSession && (activeSession.orderId === orderId || activeSession.id === queueId)) {
    return {
      inQueue: false,
      isMyTurn: true,
      status: activeSession.status,
      orderId: activeSession.orderId,
      queueId: activeSession.id,
      position: 0,
      totalInQueue: queue.length,
      rawPrompt: activeSession.rawPrompt,
      link: activeSession.link,
      error: activeSession.error,
    };
  }

  // 2. Kiểm tra trong hàng đợi
  const idx = queue.findIndex((item) => item.orderId === orderId || item.id === queueId);
  if (idx !== -1) {
    return {
      inQueue: true,
      isMyTurn: false,
      status: 'in_queue',
      orderId: queue[idx].orderId,
      queueId: queue[idx].id,
      position: idx + 1,
      totalInQueue: queue.length,
      message: `Hệ thống đang xử lý cho khách trước. Vị trí xếp hàng của bạn: #${idx + 1} (Vui lòng giữ nguyên màn hình)...`,
    };
  }

  // 3. Nếu không tìm thấy trong RAM (có thể đã xong hoặc đã hủy)
  return {
    inQueue: false,
    isMyTurn: false,
    status: 'not_found',
    totalInQueue: queue.length,
  };
}

/**
 * Xác thực OTP cho phiên đang hoạt động
 */
async function verifyOtp(orderId, otp) {
  if (!activeSession || activeSession.orderId !== orderId) {
    throw new Error('Phiên xử lý của bạn đã hết hạn hoặc chưa đến lượt.');
  }

  activeSession.status = 'verifying';

  try {
    const result = await telegramUserbot.verifyGeminiOtp(otp, orderId);

    if (result.success && result.link) {
      activeSession.status = 'completed';
      activeSession.link = result.link;

      const order = await Order.findById(orderId);
      if (order) {
        order.status = 'completed';
        order.secretLink = result.link;
        order.cancelNote = '';
        await order.save();
      }

      const completedLink = result.link;

      // Giải phóng phiên hiện tại và chuyển sang người tiếp theo
      setTimeout(() => {
        activeSession = null;
        processNext();
      }, 1500);

      return {
        success: true,
        status: 'completed',
        link: completedLink,
      };
    } else {
      await handleSessionFailure(activeSession, result.reason || 'Bot báo sai mã OTP hoặc không lấy được link.');
      const reason = activeSession.error;

      setTimeout(() => {
        activeSession = null;
        processNext();
      }, 1500);

      return {
        success: false,
        status: 'cancelled',
        reason,
      };
    }
  } catch (err) {
    await handleSessionFailure(activeSession, err.message || 'Lỗi kết nối khi gửi OTP tới Bot.');
    const reason = activeSession.error;

    setTimeout(() => {
      activeSession = null;
      processNext();
    }, 1500);

    return {
      success: false,
      status: 'cancelled',
      reason,
    };
  }
}

/**
 * Người dùng chủ động hủy hàng đợi hoặc hủy phiên
 */
async function cancelQueue(orderId, queueId, userId) {
  // 1. Nếu đang nằm trong hàng đợi
  const idx = queue.findIndex(
    (item) => (item.orderId === orderId || item.id === queueId) && (!userId || String(item.userId) === String(userId))
  );
  if (idx !== -1) {
    const [removed] = queue.splice(idx, 1);
    await handleSessionFailure(removed, 'Khách hàng đã chủ động hủy xếp hàng.');
    return {
      success: true,
      message: 'Đã hủy xếp hàng thành công. Số tiền đã được tự động hoàn lại vào ví.',
    };
  }

  // 2. Nếu là phiên đang hoạt động
  if (
    activeSession &&
    (activeSession.orderId === orderId || activeSession.id === queueId) &&
    (!userId || String(activeSession.userId) === String(userId))
  ) {
    await handleSessionFailure(activeSession, 'Khách hàng đã chủ động hủy phiên.');
    activeSession = null;
    setTimeout(() => {
      processNext();
    }, 1000);
    return {
      success: true,
      message: 'Đã hủy phiên kích hoạt thành công. Số tiền đã được tự động hoàn lại vào ví.',
    };
  }

  return {
    success: false,
    message: 'Không tìm thấy phiên trong hàng đợi để hủy.',
  };
}

// Watchdog kiểm tra timeout 3 phút mỗi 5 giây
setInterval(() => {
  if (activeSession && activeSession.status === 'waiting_otp' && activeSession.otpWaitingSince) {
    if (Date.now() - activeSession.otpWaitingSince > OTP_TIMEOUT_MS) {
      console.warn(`[Gemini Watchdog] Đơn #${activeSession.orderId} quá 3 phút chưa nhập OTP. Tự động hoàn tiền & tiếp tục hàng đợi.`);
      handleSessionFailure(activeSession, 'Quá thời gian 3 phút không nhập mã OTP. Tiền đã được hoàn lại vào ví.')
        .finally(() => {
          activeSession = null;
          processNext();
        });
    }
  }
}, 5000);

module.exports = {
  enqueueOrStart,
  getQueueStatus,
  verifyOtp,
  cancelQueue,
};
