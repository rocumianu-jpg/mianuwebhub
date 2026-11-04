'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Thông số cố định theo yêu cầu
const API_ID = 32754606;
const API_HASH = 'ca67e5bc4cd9951163bece79049b5460';
const BOT_TARGET = '@ngtrungthanhvip_bot';

let clientInstance = null;
let cachedBotEntity = null;

// Khóa phiên (Lock) để tránh nhiều user kích hoạt cùng lúc làm rối ngữ cảnh hội thoại của bot
let sessionLock = {
  isBusy: false,
  orderId: null,
  gmail: null,
  lockedAt: null,
};

// Tự động giải phóng lock sau 4 phút nếu user không nhập OTP
const LOCK_TIMEOUT_MS = 4 * 60 * 1000;

function checkAndAutoReleaseLock() {
  if (sessionLock.isBusy && sessionLock.lockedAt) {
    if (Date.now() - sessionLock.lockedAt > LOCK_TIMEOUT_MS) {
      console.warn('[Userbot Lock] Quá 4 phút chưa nhập OTP, tự động giải phóng lock.');
      sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };
    }
  }
}

/**
 * Khởi tạo hoặc lấy Client Telegram đang chạy
 */
async function getClient() {
  const sessionString = process.env.TELEGRAM_STRING_SESSION;
  if (!sessionString) {
    throw new Error(
      'Chưa cấu hình TELEGRAM_STRING_SESSION trong file .env! Hãy chạy script "node generateSession.js" để lấy session.'
    );
  }

  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  const stringSession = new StringSession(sessionString.trim());
  clientInstance = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await clientInstance.connect();
  console.log('✅ [Telegram Userbot] Đã kết nối thành công với tài khoản Telegram.');
  return clientInstance;
}

/**
 * Lấy đối tượng entity của Bot mục tiêu (@ngtrungthanhvip_bot)
 */
async function getBotEntity(client) {
  if (cachedBotEntity) return cachedBotEntity;
  try {
    cachedBotEntity = await client.getEntity(BOT_TARGET);
    return cachedBotEntity;
  } catch (err) {
    console.error(`Không thể tìm thấy bot ${BOT_TARGET}:`, err.message);
    throw new Error(`Không thể tìm thấy bot ${BOT_TARGET} trên Telegram.`);
  }
}

/**
 * Gửi tin nhắn và chờ phản hồi từ Bot
 * @param {TelegramClient} client
 * @param {any} botEntity
 * @param {string} messageText
 * @param {number} timeoutSeconds
 * @param {(text: string) => boolean} [predicate]
 */
async function sendAndWaitForReply(client, botEntity, messageText, timeoutSeconds = 30, predicate = null) {
  // Lấy ID tin nhắn mới nhất trước khi gửi
  const existingMsgs = await client.getMessages(botEntity, { limit: 1 });
  const lastId = existingMsgs && existingMsgs.length > 0 ? existingMsgs[0].id : 0;

  // Gửi tin nhắn
  console.log(`[Userbot -> Bot] Gửi: "${messageText}"`);
  await client.sendMessage(botEntity, { message: messageText });

  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Lắng nghe mỗi 1.5s

    const msgs = await client.getMessages(botEntity, { limit: 5 });
    // Tìm tin nhắn đến từ bot (out = false) có ID lớn hơn tin nhắn vừa gửi
    const incoming = msgs.find((m) => !m.out && m.id > lastId);

    if (incoming && incoming.message) {
      const text = incoming.message.trim();
      console.log(`[Bot -> Userbot] Nhận: "${text}"`);

      if (predicate) {
        if (predicate(text)) {
          return incoming;
        }
        // Nếu tin nhắn báo lỗi rõ ràng thì ngắt sớm
        if (
          text.toLowerCase().includes('lỗi') ||
          text.toLowerCase().includes('thất bại') ||
          text.toLowerCase().includes('không hợp lệ') ||
          text.toLowerCase().includes('đã tồn tại')
        ) {
          throw new Error(text);
        }
      } else {
        return incoming;
      }
    }
  }

  throw new Error(`Quá thời gian chờ phản hồi (${timeoutSeconds}s) từ ${BOT_TARGET}`);
}

/**
 * Bắt đầu luồng kích hoạt Gemini
 * 1. Gửi /run
 * 2. Đợi bot phản hồi
 * 3. Gửi gmail
 * 4. Đợi bot phản hồi yêu cầu 6 số OTP (5-20s)
 */
async function startGeminiActivation(gmail, orderId) {
  checkAndAutoReleaseLock();

  if (sessionLock.isBusy && sessionLock.orderId !== orderId) {
    throw new Error('Hệ thống đang xử lý đơn hàng khác qua Telegram Bot. Vui lòng chờ 30 giây và thử lại.');
  }

  const client = await getClient();
  const botEntity = await getBotEntity(client);

  // Đặt khóa phiên
  sessionLock = {
    isBusy: true,
    orderId,
    gmail,
    lockedAt: Date.now(),
  };

  try {
    // Bước 1: Gửi lệnh /run
    console.log('[Luồng Gemini 1] Đang gửi lệnh /run tới bot...');
    await sendAndWaitForReply(client, botEntity, '/run', 20);

    // Dừng nhẹ 1 giây để bot chuyển trạng thái
    await new Promise((r) => setTimeout(r, 1000));

    // Bước 2: Gửi Gmail và chờ bot yêu cầu nhập OTP (5-25s)
    console.log(`[Luồng Gemini 2] Đang gửi Gmail "${gmail}" tới bot...`);
    const otpPromptReply = await sendAndWaitForReply(
      client,
      botEntity,
      gmail,
      35,
      (text) => {
        const lower = text.toLowerCase();
        return (
          lower.includes('otp') ||
          lower.includes('mã') ||
          lower.includes('6 số') ||
          lower.includes('xác thực') ||
          lower.includes('xác nhận') ||
          lower.includes('code')
        );
      }
    );

    console.log('[Luồng Gemini 3] Bot đã phản hồi yêu cầu OTP:', otpPromptReply.message);
    return {
      success: true,
      status: 'waiting_otp',
      rawPrompt: otpPromptReply.message,
    };
  } catch (error) {
    // Mở khóa nếu xảy ra lỗi trong bước khởi động
    sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };
    throw error;
  }
}

/**
 * Xác thực OTP và lấy Link kích hoạt
 * 1. Gửi OTP tới bot
 * 2. Kiểm tra phản hồi: nếu có link (http...) thì completed, nếu sai/lỗi thì cancelled
 */
async function verifyGeminiOtp(otp, orderId) {
  const client = await getClient();
  const botEntity = await getBotEntity(client);

  try {
    console.log(`[Luồng Gemini 4] Đang gửi OTP "${otp}" tới bot...`);
    const reply = await sendAndWaitForReply(client, botEntity, String(otp).trim(), 35);
    const text = reply.message || '';

    // Kiểm tra xem phản hồi có chứa link (http / https) hay không
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);

    if (matches && matches.length > 0) {
      const link = matches[0].replace(/[.,)>)]+$/, '');
      console.log(`[Luồng Gemini 5] Thành công! Đã trích xuất link: ${link}`);

      // Giải phóng lock
      sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };

      return {
        success: true,
        status: 'completed',
        link,
        rawMessage: text,
      };
    }

    // Không tìm thấy link trong phản hồi -> Sai OTP hoặc bot từ chối
    console.warn(`[Luồng Gemini 5] Bot không trả về link hoặc báo lỗi: ${text}`);

    // Giải phóng lock
    sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };

    return {
      success: false,
      status: 'cancelled',
      reason: text || 'Bot báo sai mã OTP hoặc không thể lấy link kích hoạt.',
    };
  } catch (error) {
    sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };
    return {
      success: false,
      status: 'cancelled',
      reason: error.message || 'Lỗi kết nối khi gửi mã OTP tới Telegram Bot.',
    };
  }
}

module.exports = {
  getClient,
  startGeminiActivation,
  verifyGeminiOtp,
};