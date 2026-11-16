'use strict';

/**
 * Script độc lập để đăng nhập Telegram và tạo STRING_SESSION một lần duy nhất.
 * Cách chạy: node generateSession.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

// Thông số cố định từ Telegram Developer App
const API_ID = 32754606;
const API_HASH = 'ca67e5bc4cd9951163bece79049b5460';
const stringSession = new StringSession('');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function run() {
  console.log('====================================================');
  console.log('    TELEGRAM USERBOT - TẠO STRING_SESSION (GRAMJS)   ');
  console.log('====================================================\n');

  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => {
        const phone = await askQuestion(
          '👉 Nhập số điện thoại Telegram (kèm mã quốc tế, VD: +84912345678): '
        );
        return phone.trim();
      },
      password: async () => {
        const pass = await askQuestion(
          '👉 Nhập mật khẩu 2FA (nếu có, không có thì nhấn Enter): '
        );
        return pass.trim();
      },
      phoneCode: async () => {
        const code = await askQuestion(
          '👉 Nhập mã OTP nhận được từ tin nhắn Telegram: '
        );
        return code.trim();
      },
      onError: (err) => {
        console.error('❌ Lỗi xác thực:', err.message || err);
      },
    });

    console.log('\n✅ ĐĂNG NHẬP THÀNH CÔNG VÀO TÀI KHOẢN TELEGRAM!');
    const sessionString = client.session.save();

    console.log('\n=================== STRING_SESSION ===================\n');
    console.log(sessionString);
    console.log('\n======================================================\n');
    console.log('💡 HƯỚNG DẪN TIẾP THEO:');
    console.log('1. Copy toàn bộ chuỗi STRING_SESSION ở trên.');
    console.log('2. Dán vào file .env của Backend dòng sau:');
    console.log(`TELEGRAM_STRING_SESSION=${sessionString}`);
    console.log('3. Nếu deploy lên Render, hãy thêm biến môi trường TELEGRAM_STRING_SESSION vào mục Environment.');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Lỗi trong quá trình tạo session:', error.message || error);
  } finally {
    rl.close();
    await client.disconnect();
    process.exit(0);
  }
}

run();