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

// Tự động giải phóng lock sau 5 phút nếu user không nhập OTP
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function checkAndAutoReleaseLock() {
  if (sessionLock.isBusy && sessionLock.lockedAt) {
    if (Date.now() - sessionLock.lockedAt > LOCK_TIMEOUT_MS) {
      console.warn('[Userbot Lock] Quá 5 phút chưa hoàn thành, tự động giải phóng lock.');
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
 * Gửi tin nhắn và chờ phản hồi từ Bot (Dùng cho bước 1: /run và gửi gmail)
 */
async function sendAndWaitForReply(client, botEntity, messageText, timeoutSeconds = 30, predicate = null) {
  // Lấy ID tin nhắn mới nhất trước khi gửi
  const existingMsgs = await client.getMessages(botEntity, { limit: 1 });
  const lastId = existingMsgs && existingMsgs.length > 0 ? existingMsgs[0].id : 0;

  console.log(`[Userbot -> Bot] Gửi: "${messageText}"`);
  await client.sendMessage(botEntity, { message: messageText });

  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Lắng nghe mỗi 1.5s

    const msgs = await client.getMessages(botEntity, { limit: 5 });
    const incoming = msgs.find((m) => !m.out && m.id > lastId);

    if (incoming && incoming.message) {
      const text = incoming.message.trim();
      console.log(`[Bot -> Userbot] Nhận: "${text}"`);

      if (predicate) {
        if (predicate(text)) {
          return incoming;
        }
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
 * Bắt đầu luồng kích hoạt Gemini (Bước 1: /run và Gmail)
 */
async function startGeminiActivation(gmail, orderId) {
  checkAndAutoReleaseLock();

  if (sessionLock.isBusy && sessionLock.orderId !== orderId) {
    throw new Error('Hệ thống đang xử lý đơn hàng khác qua Telegram Bot. Vui lòng chờ 30 giây và thử lại.');
  }

  const client = await getClient();
  const botEntity = await getBotEntity(client);

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
    sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };
    throw error;
  }
}

/**
 * VÒNG LẶP CHỜ KẾT QUẢ XÁC THỰC OTP (Bước 2):
 * - Thời gian chờ tối đa 60 giây (poll mỗi 2 giây)
 * - Tự động bỏ qua các tin nhắn trạng thái trung gian ("Đang xử lý...", "Vui lòng chờ...")
 * - Bắt tin nhắn có chứa "http" hoặc "NHẬN ƯU ĐÃI THÀNH CÔNG!"
 * - Chỉ hủy đơn/hoàn tiền khi hết 60s hoặc Bot phản hồi rõ ràng sai mã OTP
 */
async function waitForVerificationResult(client, botEntity, lastId, timeoutSeconds = 60) {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  let lastLoggedText = '';

  console.log(`[Luồng Gemini 4] Bắt đầu vòng lặp chờ kết quả từ Bot (Tối đa ${timeoutSeconds}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Kiểm tra mỗi 2 giây

    // Lấy 8 tin nhắn mới nhất trong đoạn chat
    const msgs = await client.getMessages(botEntity, { limit: 8 });

    // Lọc các tin nhắn đến từ bot sau thời điểm gửi OTP
    const incomingMsgs = msgs.filter((m) => !m.out && m.id > lastId);

    if (incomingMsgs.length > 0) {
      // Gộp nội dung để trích xuất đầy đủ nếu bot gửi nhiều tin nhắn liên tiếp
      const combinedText = incomingMsgs.map((m) => m.message || '').join('\n');
      const latestText = incomingMsgs[0]?.message?.trim() || '';

      if (latestText !== lastLoggedText) {
        console.log(`[Bot -> Userbot (Đang xử lý...)]\n${latestText}`);
        lastLoggedText = latestText;
      }

      const lowerCombined = combinedText.toLowerCase();

      // 1. KIỂM TRA ĐIỀU KIỆN THÀNH CÔNG: Chứa link (http...) hoặc keyword "NHẬN ƯU ĐÃI THÀNH CÔNG!"
      const urlRegex = /(https?:\/\/[^\s"'<>\)]+)/gi;
      const urlMatches = combinedText.match(urlRegex);

      const hasSuccessKeyword =
        combinedText.includes('NHẬN ƯU ĐÃI THÀNH CÔNG') ||
        lowerCombined.includes('nhận ưu đãi thành công');

      // Nếu đã có link hoặc có thông báo thành công kèm link
      if (urlMatches && urlMatches.length > 0) {
        const cleanLink = urlMatches[0].replace(/[.,)>)]+$/, '');
        console.log(`🎉 [Luồng Gemini 5] THÀNH CÔNG! Đã nhận được link ưu đãi: ${cleanLink}`);
        return {
          success: true,
          status: 'completed',
          link: cleanLink,
          rawMessage: combinedText,
        };
      }

      if (hasSuccessKeyword && !urlMatches) {
        console.log('[Luồng Gemini 5] Đã thấy từ khóa "NHẬN ƯU ĐÃI THÀNH CÔNG!", đang đợi bot gửi kèm link...');
      }

      // 2. KIỂM TRA BÁO SAI MÃ OTP RÕ RÀNG (Ngắt sớm nếu sai OTP)
      if (
        lowerCombined.includes('sai otp') ||
        lowerCombined.includes('otp không đúng') ||
        lowerCombined.includes('mã không chính xác') ||
        lowerCombined.includes('hết hạn') ||
        lowerCombined.includes('mã otp không hợp lệ')
      ) {
        console.warn(`❌ [Luồng Gemini 5] Bot thông báo sai mã OTP: ${latestText}`);
        return {
          success: false,
          status: 'cancelled',
          reason: latestText || 'Bot báo sai mã OTP hoặc OTP đã hết hạn.',
        };
      }

      // 3. NẾU LÀ TIN TRẠNG THÁI (vd: "Đang kiểm tra...", "Vui lòng đợi..."): BỎ QUA VÀ TIẾP TỤC ĐỢI!
    }
  }

  // Quá 60 giây không có link
  console.warn(`⏰ [Luồng Gemini 5] Đã quá ${timeoutSeconds}s không nhận được link kích hoạt từ Bot.`);
  return {
    success: false,
    status: 'cancelled',
    reason: `Bot xử lý quá thời gian (${timeoutSeconds}s) hoặc không thể lấy link kích hoạt.`,
  };
}

/**
 * Xác thực OTP và lấy Link kích hoạt
 */
async function verifyGeminiOtp(otp, orderId) {
  const client = await getClient();
  const botEntity = await getBotEntity(client);

  try {
    // 1. Lấy ID tin nhắn mới nhất trước khi gửi OTP để tránh đọc nhầm tin cũ
    const existingMsgs = await client.getMessages(botEntity, { limit: 1 });
    const lastId = existingMsgs && existingMsgs.length > 0 ? existingMsgs[0].id : 0;

    // 2. Gửi mã OTP tới bot
    console.log(`[Luồng Gemini 4] Đang gửi OTP "${otp}" tới bot @ngtrungthanhvip_bot...`);
    await client.sendMessage(botEntity, { message: String(otp).trim() });

    // 3. Lắng nghe liên tục tối đa 60 giây để bắt link / "NHẬN ƯU ĐÃI THÀNH CÔNG!"
    const result = await waitForVerificationResult(client, botEntity, lastId, 60);

    // 4. Giải phóng lock sau khi xong
    sessionLock = { isBusy: false, orderId: null, gmail: null, lockedAt: null };

    return result;
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