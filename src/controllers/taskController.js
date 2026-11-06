'use strict';

const crypto = require('crypto');
const axios = require('axios');
const Task = require('../models/Task');
const TaskHistory = require('../models/TaskHistory');
const CoinTransaction = require('../models/CoinTransaction');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Trả về mốc thời gian 00:00:00 và 23:59:59 của ngày hôm nay
 */
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Render trang HTML thông báo phản hồi khi người dùng được redirect về Postback qua trình duyệt
 */
function renderPostbackHtml({
  type,
  title,
  message,
  subMessage,
  autoClose,
  countdown,
  frontendUrl,
}) {
  const isSuccess = type === 'success';
  const isError = type === 'error';
  const bgGradient = isSuccess
    ? 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)'
    : isError
    ? 'linear-gradient(135deg, #881337 0%, #9f1239 50%, #be123c 100%)'
    : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';

  const icon = isSuccess ? '🪙' : isError ? '🚨' : 'ℹ️';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Mianu WorkShop</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: #f8fafc;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon-badge {
      width: 76px;
      height: 76px;
      border-radius: 22px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      background: ${bgGradient};
      box-shadow: 0 10px 25px -5px ${
        isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
      };
    }
    h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin-bottom: 20px;
    }
    .sub-box {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 600;
      color: ${isSuccess ? '#34d399' : '#f87171'};
      margin-bottom: 24px;
    }
    .countdown-text {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 20px;
    }
    .countdown-text strong {
      color: #f59e0b;
      font-size: 14px;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      padding: 11px 20px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-primary {
      background: #f59e0b;
      color: #000;
    }
    .btn-primary:hover {
      background: #d97706;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${subMessage ? `<div class="sub-box">${subMessage}</div>` : ''}
    ${
      autoClose
        ? `<div class="countdown-text">Tab này sẽ tự động đóng sau <strong id="timer">${
            countdown || 3
          }</strong>s...</div>`
        : ''
    }
    <div class="btn-group">
      <button onclick="window.close()" class="btn btn-secondary">Đóng Tab Ngay</button>
      <a href="${frontendUrl}/tasks" class="btn btn-primary">Về Mianu WorkShop</a>
    </div>
  </div>
  ${
    autoClose
      ? `<script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'TASK_COMPLETED' }, '*');
      }
    } catch(e) {}
    var sec = ${countdown || 3};
    var timerEl = document.getElementById('timer');
    var interval = setInterval(function() {
      sec--;
      if (timerEl) timerEl.innerText = sec;
      if (sec <= 0) {
        clearInterval(interval);
        window.close();
        setTimeout(function() {
          window.location.href = '${frontendUrl}/tasks?success=true';
        }, 400);
      }
    }, 1000);
  </script>`
      : ''
  }
</body>
</html>`;
}

// ─── USER CONTROLLERS ────────────────────────────────────────────────────────

/**
 * GET /api/tasks
 * Lấy danh sách nhiệm vụ đang mở kèm tiến độ làm của User trong ngày
 */
const getPublicTasks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { start, end } = getTodayRange();

    const tasks = await Task.find({ isActive: true }).sort({ rewardCoins: -1 });

    // Lấy lịch sử hoàn thành trong ngày hôm nay của user
    const completedTodayList = await TaskHistory.find({
      userId,
      status: 'completed',
      createdAt: { $gte: start, $lte: end },
    }).select('taskId rewardCoins');

    // Gom số lần đã làm theo taskId
    const countsMap = {};
    let todayCoins = 0;
    completedTodayList.forEach((item) => {
      const idStr = item.taskId.toString();
      countsMap[idStr] = (countsMap[idStr] || 0) + 1;
      todayCoins += item.rewardCoins || 0;
    });

    const totalCompleted = await TaskHistory.countDocuments({
      userId,
      status: 'completed',
    });

    const enrichedTasks = tasks.map((task) => {
      const completedToday = countsMap[task._id.toString()] || 0;
      const remainingToday = Math.max(0, task.dailyLimit - completedToday);
      return {
        _id: task._id,
        name: task.name,
        slug: task.slug,
        description: task.description,
        rewardCoins: task.rewardCoins,
        dailyLimit: task.dailyLimit,
        minDurationSeconds: task.minDurationSeconds,
        targetUrl: task.targetUrl,
        guideText: task.guideText,
        icon: task.icon,
        apiType: task.apiType || 'standard',
        isActive: task.isActive,
        completedToday,
        remainingToday,
        isCompletedMax: completedToday >= task.dailyLimit,
      };
    });

    const currentUser = await User.findById(userId).select('coinBalance balance');

    return res.json({
      success: true,
      tasks: enrichedTasks,
      userCoinBalance: currentUser?.coinBalance || 0,
      stats: {
        todayCoins,
        todayCompleted: completedTodayList.length,
        totalCompleted,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Khởi tạo phiên làm việc và gọi Developer API (LenTop, PhienChoSo...) để lấy link rút gọn
 */
async function processTaskSession({ taskId, userId, req }) {
  const { start, end } = getTodayRange();

  const task = await Task.findById(taskId);
  if (!task || !task.isActive) {
    const err = new Error('Nhiệm vụ không tồn tại hoặc đã tạm dừng.');
    err.status = 404;
    throw err;
  }

  // Kiểm tra giới hạn ngày
  const completedToday = await TaskHistory.countDocuments({
    userId,
    taskId: task._id,
    status: 'completed',
    createdAt: { $gte: start, $lte: end },
  });

  if (completedToday >= task.dailyLimit) {
    const err = new Error(
      `Bạn đã đạt giới hạn tối đa của nhiệm vụ ${task.name} trong ngày hôm nay (${task.dailyLimit} lần/ngày). Vui lòng quay lại vào ngày mai!`
    );
    err.status = 400;
    throw err;
  }

  // Tạo mã phiên định danh duy nhất (sessionToken)
  const sessionToken = crypto.randomBytes(16).toString('hex');
  const clickTime = new Date();

  const taskHistory = await TaskHistory.create({
    userId,
    taskId: task._id,
    taskName: task.name,
    sessionToken,
    clickTime,
    status: 'started',
    ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    note: 'Khởi tạo phiên vượt link',
  });

  // Xác định URL của Backend Mianu để làm Postback
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:5000';
  const officialDomain = 'https://mianuwebhub.store';
  const serverBaseUrl = process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? officialDomain : `${protocol}://${host}`);
  const mianuPostbackUrl = `${serverBaseUrl}/api/tasks/postback?token=${sessionToken}`;
  const encodedPostbackUrl = encodeURIComponent(mianuPostbackUrl);

  let redirectUrl = '';

  const isLentop =
    task.apiType === 'lentop_json' ||
    (task.targetUrl && task.targetUrl.toLowerCase().includes('lentop.one'));

  const isPhienChoSo =
    task.apiType === 'phienchoso_json' ||
    (task.targetUrl && task.targetUrl.toLowerCase().includes('phienchoso.com'));

  if (isLentop) {
    // ─── 1. XỬ LÝ LENTOP DEVELOPER API (JSON RESPONSE) ───────────────────────
    let lentopToken = (task.apiToken || '').trim();
    if (!lentopToken && task.targetUrl) {
      const match = task.targetUrl.match(/[?&]api=([^&]+)/);
      if (match) lentopToken = decodeURIComponent(match[1]);
    }

    if (!lentopToken) {
      taskHistory.status = 'rejected';
      taskHistory.note = 'Lỗi: Nhiệm vụ LenTop chưa cài đặt API Token';
      await taskHistory.save();
      const err = new Error('Nhiệm vụ này (LenTop) chưa được Quản trị viên cài đặt API Token.');
      err.status = 400;
      throw err;
    }

    let lentopEndpoint = 'https://lentop.one/api';
    if (task.targetUrl && task.targetUrl.startsWith('http') && task.targetUrl.includes('lentop.one')) {
      lentopEndpoint = task.targetUrl.split('?')[0];
    }

    // Cập nhật đường link Postback chính thức để LenTop chuyển hướng khách về sau khi hoàn thành
    const lentopPostbackUrl = `https://mianuwebhub.store/api/tasks/postback?token=${sessionToken}`;
    const encodedLentopPostback = encodeURIComponent(lentopPostbackUrl);

    const lentopRequestUrl = `${lentopEndpoint}?api=${encodeURIComponent(
      lentopToken
    )}&url=${encodedLentopPostback}`;

    try {
      const lentopRes = await axios.get(lentopRequestUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MianuWorkShop/2.0',
        },
      });

      const resData = lentopRes.data;
      let finalShortUrl = resData?.shortenedUrl || resData?.url || resData?.short_url;

      if (finalShortUrl && typeof finalShortUrl === 'string') {
        // Gỡ bỏ escaped slash \/ nếu có
        finalShortUrl = finalShortUrl.replace(/\\\//g, '/').trim();
        redirectUrl = finalShortUrl;
        taskHistory.note = `Đã sinh link LenTop thành công: ${redirectUrl}`;
        await taskHistory.save();
      } else {
        const errMsg = resData?.message || resData?.error || JSON.stringify(resData);
        taskHistory.status = 'rejected';
        taskHistory.note = `LenTop từ chối tạo link: ${errMsg}`;
        await taskHistory.save();
        const err = new Error(`LenTop từ chối tạo link: ${errMsg}`);
        err.status = 400;
        throw err;
      }
    } catch (apiErr) {
      const errDetail = apiErr.response?.data?.message || apiErr.message;
      taskHistory.status = 'rejected';
      taskHistory.note = `Lỗi kết nối API LenTop: ${errDetail}`;
      await taskHistory.save();
      const err = new Error(`Không thể kết nối đến máy chủ LenTop (${errDetail}). Vui lòng thử lại sau.`);
      err.status = 502;
      throw err;
    }
  } else if (isPhienChoSo) {
    // ─── 2. XỬ LÝ PHIÊN CHỢ SỐ DEVELOPER API (JSON RESPONSE) ─────────────────
    const adminToken = (task.apiToken || '').trim();
    if (!adminToken) {
      taskHistory.status = 'rejected';
      taskHistory.note = 'Lỗi: Nhiệm vụ PhienChoSo chưa cài API Token trong Admin';
      await taskHistory.save();
      const err = new Error('Nhiệm vụ này (Phiên Chợ Số) chưa được Quản trị viên cài đặt API Token.');
      err.status = 400;
      throw err;
    }

    const apiEndpoint =
      task.targetUrl && task.targetUrl.startsWith('http') && task.targetUrl.includes('phienchoso.com')
        ? task.targetUrl.split('?')[0]
        : 'https://api.phienchoso.com/tukhoa-dev.php';

    const phienChoSoRequestUrl = `${apiEndpoint}?token=${encodeURIComponent(
      adminToken
    )}&url=${encodedPostbackUrl}&url_duphong=${encodedPostbackUrl}`;

    try {
      const phienChoSoRes = await axios.get(phienChoSoRequestUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MianuWorkShop/2.0',
        },
      });

      const resData = phienChoSoRes.data;
      if (resData && (resData.status === 'success' || resData.url)) {
        redirectUrl = (resData.url || '').replace(/\\\//g, '/').trim();
        taskHistory.note = `Đã sinh link PhienChoSo: ${redirectUrl}`;
        await taskHistory.save();
      } else {
        const errMsg = resData?.message || resData?.error || JSON.stringify(resData);
        taskHistory.status = 'rejected';
        taskHistory.note = `PhienChoSo từ chối: ${errMsg}`;
        await taskHistory.save();
        const err = new Error(`Phiên Chợ Số từ chối tạo link: ${errMsg}`);
        err.status = 400;
        throw err;
      }
    } catch (apiErr) {
      const errDetail = apiErr.response?.data?.message || apiErr.message;
      taskHistory.status = 'rejected';
      taskHistory.note = `Lỗi kết nối API PhienChoSo: ${errDetail}`;
      await taskHistory.save();
      const err = new Error(`Không thể kết nối đến máy chủ Phiên Chợ Số (${errDetail}).`);
      err.status = 502;
      throw err;
    }
  } else {
    // ─── 3. XỬ LÝ MẠNG TIÊU CHUẨN (STANDARD) ────────────────────────────────
    if (task.targetUrl) {
      redirectUrl = task.targetUrl
        .replace('{token}', sessionToken)
        .replace('{userId}', userId.toString())
        .replace('{sessionToken}', sessionToken);
      if (!redirectUrl.includes(sessionToken)) {
        const separator = redirectUrl.includes('?') ? '&' : '?';
        redirectUrl = `${redirectUrl}${separator}token=${sessionToken}&userId=${userId}`;
      }
    } else {
      redirectUrl = `https://trafficvn.top/shortlink?token=${sessionToken}&uid=${userId}`;
    }
  }

  return { task, taskHistory, sessionToken, redirectUrl };
}

/**
 * GET /api/tasks/generate
 * Chuyển hướng trực tiếp (HTTP 302 Redirect) trình duyệt của khách hàng sang trang làm nhiệm vụ (LenTop, v.v.)
 */
const generateTaskLink = async (req, res, next) => {
  try {
    const taskId = req.query.taskId || req.params.id;
    const userId = req.user._id;

    if (!taskId) {
      return res.status(400).send('Thiếu tham số taskId.');
    }

    const { redirectUrl } = await processTaskSession({ taskId, userId, req });

    // Dùng HTTP 302 ép trình duyệt chuyển hướng thẳng sang link nhiệm vụ (LenTop, v.v.)
    return res.redirect(302, redirectUrl);
  } catch (err) {
    const isHtml =
      req.headers.accept?.includes('text/html') || !req.headers.accept?.includes('application/json');
    if (isHtml) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://mianuwebhub.store';
      return res.status(err.status || 400).send(
        renderPostbackHtml({
          type: 'error',
          title: 'Không thể khởi tạo link',
          message: err.message,
          frontendUrl,
        })
      );
    }
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/tasks/:id/start
 * Khởi tạo phiên làm nhiệm vụ (dạng JSON API)
 */
const startTask = async (req, res, next) => {
  try {
    const taskId = req.params.id || req.body.taskId || req.query.taskId;
    const userId = req.user._id;

    const { task, taskHistory, sessionToken, redirectUrl } = await processTaskSession({
      taskId,
      userId,
      req,
    });

    return res.status(201).json({
      success: true,
      message: 'Đã khởi tạo phiên vượt link an toàn!',
      sessionToken,
      redirectUrl,
      taskName: task.name,
      minDurationSeconds: task.minDurationSeconds || 30,
      historyId: taskHistory._id,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
};

/**
 * GET & POST /api/tasks/postback
 * Webhook nhận kết quả từ bên thứ 3 (Link4M, TrafficVN, PhienChoSo...)
 * KÈM LỚP PHÒNG THỦ ANTI-CHEAT (BẪY THỜI GIAN & GIỚI HẠN NGÀY)
 * HỖ TRỢ TRẢ VỀ FILE HTML TỰ ĐÓNG TAB KHI USER ĐƯỢC CHUYỂN HƯỚNG TRỰC TIẾP
 */
const handlePostback = async (req, res, next) => {
  try {
    const params = { ...req.query, ...req.body };
    const token = params.token || params.sessionToken || params.session_token || params.order_id;
    const bypassSimulate = params.bypassSimulate === true || params.bypassSimulate === 'true';

    const frontendUrl = process.env.FRONTEND_URL || 'https://mianuwebhub.store';

    // Nhận diện nếu request đến từ chuyển hướng trình duyệt của User (như PhienChoSo redirect)
    const isBrowserNavigation =
      req.method === 'GET' &&
      (!req.headers.accept?.includes('application/json') || req.headers.accept?.includes('text/html'));

    if (!token) {
      if (isBrowserNavigation) {
        return res
          .status(400)
          .send(
            renderPostbackHtml({
              type: 'error',
              title: 'LỖI PHIÊN LÀM VIỆC',
              message: 'Thiếu mã token xác thực phiên làm nhiệm vụ (sessionToken).',
              autoClose: false,
              frontendUrl,
            })
          );
      }
      return res.status(400).json({
        success: false,
        message: 'Thiếu tham số token nhận dạng phiên (sessionToken).',
      });
    }

    const taskHistory = await TaskHistory.findOne({ sessionToken: token });
    if (!taskHistory) {
      if (isBrowserNavigation) {
        return res
          .status(404)
          .send(
            renderPostbackHtml({
              type: 'error',
              title: 'PHIÊN KHÔNG TỒN TẠI',
              message: 'Mã phiên token không hợp lệ hoặc đã bị hủy khỏi hệ thống.',
              autoClose: false,
              frontendUrl,
            })
          );
      }
      return res.status(404).json({
        success: false,
        message: 'Mã phiên token không hợp lệ hoặc không tìm thấy trên hệ thống.',
      });
    }

    const task = await Task.findById(taskHistory.taskId);
    const user = await User.findById(taskHistory.userId);

    if (taskHistory.status === 'completed') {
      if (isBrowserNavigation) {
        return res
          .status(200)
          .send(
            renderPostbackHtml({
              type: 'info',
              title: 'ĐÃ NHẬN THƯỞNG TRƯỚC ĐÓ',
              message: `Phiên nhiệm vụ "${task?.name || ''}" này đã được xác nhận và cộng coin thành công trước đó.`,
              autoClose: true,
              countdown: 3,
              frontendUrl,
            })
          );
      }
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'Phiên nhiệm vụ này đã được xác nhận hoàn thành trước đó.',
        rewardCoins: taskHistory.rewardCoins,
      });
    }

    if (taskHistory.status === 'cheated') {
      if (isBrowserNavigation) {
        return res
          .status(400)
          .send(
            renderPostbackHtml({
              type: 'error',
              title: 'PHIÊN BỊ KHÓA GIAN LẬN',
              message: 'Phiên làm việc này đã bị đánh dấu sử dụng Tool bypass và khóa vĩnh viễn.',
              autoClose: false,
              frontendUrl,
            })
          );
      }
      return res.status(400).json({
        success: false,
        cheated: true,
        message: 'Phiên làm nhiệm vụ này đã bị đánh dấu gian lận và khóa vĩnh viễn.',
      });
    }

    if (!task || !user) {
      return res.status(404).json({
        success: false,
        message: 'Dữ liệu nhiệm vụ hoặc tài khoản liên quan không tồn tại.',
      });
    }

    const now = new Date();
    const minDuration = task.minDurationSeconds || 30;

    // Tính độ lệch thời gian giữa lúc bấm clickTime và lúc gọi Postback
    let elapsedSeconds = (now.getTime() - new Date(taskHistory.clickTime).getTime()) / 1000;

    // Nếu là chế độ kiểm thử bypass simulate do admin yêu cầu
    if (bypassSimulate) {
      elapsedSeconds = 5;
    }

    // ─── LỚP PHÒNG THỦ 1: ANTI-CHEAT BẪY THỜI GIAN (TIME-TRAP) ──────────────
    // Nếu hoàn thành quá nhanh (dưới 30s) -> Chắc chắn dùng Tool bypass hoặc script hack
    if (elapsedSeconds < minDuration) {
      taskHistory.status = 'cheated';
      taskHistory.completeTime = now;
      taskHistory.durationSeconds = Math.max(1, Math.round(elapsedSeconds));
      taskHistory.note = `🚨 BẪY ANTI-CHEAT: Hoàn thành chỉ trong ${elapsedSeconds.toFixed(1)}s (< ${minDuration}s) - Nghi vấn Tool/Extension Bypass gian lận!`;
      await taskHistory.save();

      // Cảnh báo ngay lập tức cho Quản Trị Viên qua Notification
      try {
        await Notification.create({
          title: `🚨 Phát hiện Tool/Bypass vượt link!`,
          message: `Tài khoản "${user.username}" vừa thực hiện nhiệm vụ "${task.name}" trong vỏn vẹn ${elapsedSeconds.toFixed(1)}s (Quy định tối thiểu: ${minDuration}s). Hệ thống đã chặn cộng Coin và ghi nhận nhật ký gian lận.`,
          type: 'system',
        });
      } catch (notifErr) {
        console.warn('Lỗi ghi notification cảnh báo gian lận:', notifErr.message);
      }

      if (isBrowserNavigation) {
        return res
          .status(400)
          .send(
            renderPostbackHtml({
              type: 'error',
              title: '🚨 BẪY ANTI-CHEAT: PHÁT HIỆN GIAN LẬN!',
              message: `Bạn hoàn thành nhiệm vụ "${task.name}" chỉ trong ${elapsedSeconds.toFixed(1)} giây (Quy định tối thiểu: ${minDuration} giây).`,
              subMessage: 'Hệ thống đã chặn cộng Coin và ghi nhận nhật ký cảnh báo vì nghi vấn dùng Tool/Extension Bypass!',
              autoClose: false,
              frontendUrl,
            })
          );
      }

      return res.status(400).json({
        success: false,
        cheated: true,
        elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
        minDuration,
        message: `Phát hiện hoàn thành quá nhanh bất thường (${elapsedSeconds.toFixed(1)}s < ${minDuration}s)! Hệ thống đã hủy kết quả và chặn cộng Coin do vi phạm quy chế Anti-Cheat.`,
      });
    }

    // ─── LỚP PHÒNG THỦ 2: GIỚI HẠN SỐ LƯỢT HÀNG NGÀY ────────────────────────
    const { start, end } = getTodayRange();
    const completedToday = await TaskHistory.countDocuments({
      userId: user._id,
      taskId: task._id,
      status: 'completed',
      createdAt: { $gte: start, $lte: end },
    });

    if (completedToday >= task.dailyLimit) {
      taskHistory.status = 'rejected';
      taskHistory.completeTime = now;
      taskHistory.durationSeconds = Math.round(elapsedSeconds);
      taskHistory.note = `Từ chối: Đã đạt tối đa ${task.dailyLimit} lần/ngày`;
      await taskHistory.save();

      if (isBrowserNavigation) {
        return res
          .status(400)
          .send(
            renderPostbackHtml({
              type: 'error',
              title: 'ĐÃ ĐẠT GIỚI HẠN HÔM NAY',
              message: `Tài khoản của bạn đã hoàn thành tối đa số lượt của nhiệm vụ "${task.name}" trong ngày (${task.dailyLimit} lượt/ngày).`,
              subMessage: 'Vui lòng quay lại vào ngày mai để tiếp tục kiếm thêm Coin!',
              autoClose: false,
              frontendUrl,
            })
          );
      }

      return res.status(400).json({
        success: false,
        message: `Tài khoản đã đạt giới hạn tối đa số lần hoàn thành nhiệm vụ này trong ngày (${task.dailyLimit} lần).`,
      });
    }

    // ─── XÁC NHẬN HỢP LỆ & CỘNG COIN CHO KHÁCH ──────────────────────────────
    taskHistory.status = 'completed';
    taskHistory.completeTime = now;
    taskHistory.durationSeconds = Math.round(elapsedSeconds);
    taskHistory.rewardCoins = task.rewardCoins;
    taskHistory.note = `Hoàn thành hợp lệ trong ${Math.round(elapsedSeconds)} giây`;
    await taskHistory.save();

    // Cộng Coin vào ví người dùng
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { coinBalance: task.rewardCoins } },
      { new: true }
    );

    // Ghi nhật ký CoinTransaction
    await CoinTransaction.create({
      userId: user._id,
      type: 'task_reward',
      amount: task.rewardCoins,
      balanceAfter: updatedUser.coinBalance,
      description: `Thưởng vượt link nhiệm vụ: ${task.name} (${Math.round(elapsedSeconds)}s)`,
      referenceId: taskHistory._id,
      taskName: task.name,
    });

    // Thông báo cho User biết họ đã nhận được Coin
    try {
      await Notification.create({
        userId: user._id,
        title: '🪙 Nhận Coin thành công!',
        message: `Bạn vừa nhận được +${task.rewardCoins} Coin từ nhiệm vụ ${task.name}! Số dư Coin hiện có: ${updatedUser.coinBalance.toLocaleString('vi-VN')} Coin.`,
        type: 'personal',
      });
    } catch (notifErr) {
      console.warn('Lỗi ghi notification nhận coin:', notifErr.message);
    }

    // Nếu khách hàng được redirect qua trình duyệt (PhienChoSo Client Redirect)
    if (isBrowserNavigation) {
      return res.status(200).send(
        renderPostbackHtml({
          type: 'success',
          title: '🎉 NHẬN THƯỞNG COIN THÀNH CÔNG!',
          message: `Chúc mừng bạn đã hoàn thành xuất sắc nhiệm vụ "${task.name}".`,
          subMessage: `+${task.rewardCoins} COIN ĐÃ ĐƯỢC CỘNG VÀO VÍ CỦA BẠN (Số dư mới: ${updatedUser.coinBalance.toLocaleString('vi-VN')} Coin)`,
          autoClose: true,
          countdown: 3,
          frontendUrl,
        })
      );
    }

    return res.status(200).json({
      success: true,
      message: `Xác nhận thành công! Bạn nhận được +${task.rewardCoins} Coin.`,
      rewardCoins: task.rewardCoins,
      newCoinBalance: updatedUser.coinBalance,
      durationSeconds: Math.round(elapsedSeconds),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tasks/history
 * Lấy lịch sử giao dịch Coin và lịch sử làm nhiệm vụ của User
 */
const getCoinHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [transactions, taskHistories] = await Promise.all([
      CoinTransaction.find({ userId }).sort({ createdAt: -1 }).limit(50),
      TaskHistory.find({ userId }).sort({ createdAt: -1 }).limit(50),
    ]);

    const user = await User.findById(userId).select('coinBalance');

    return res.json({
      success: true,
      coinBalance: user?.coinBalance || 0,
      transactions,
      taskHistories,
    });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN CONTROLLERS ───────────────────────────────────────────────────────

/**
 * GET /api/tasks/admin/list
 * Admin: Lấy danh sách nhiệm vụ, logs gian lận và thống kê
 */
const adminGetTasks = async (req, res, next) => {
  try {
    const [tasks, cheatLogs, totalCompletedCount, totalCheatedCount] = await Promise.all([
      Task.find().sort({ createdAt: -1 }),
      TaskHistory.find({ status: 'cheated' })
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .limit(30),
      TaskHistory.countDocuments({ status: 'completed' }),
      TaskHistory.countDocuments({ status: 'cheated' }),
    ]);

    return res.json({
      success: true,
      tasks,
      cheatLogs,
      stats: {
        totalTasks: tasks.length,
        totalCompleted: totalCompletedCount,
        totalCheated: totalCheatedCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tasks/admin
 * Admin: Tạo nhiệm vụ mới (hỗ trợ apiType & apiToken)
 */
const adminCreateTask = async (req, res, next) => {
  try {
    const {
      name,
      slug,
      description,
      rewardCoins,
      dailyLimit,
      isActive,
      minDurationSeconds,
      targetUrl,
      guideText,
      icon,
      apiType,
      apiToken,
    } = req.body;

    if (!name || rewardCoins === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhiệm vụ và số coin thưởng là bắt buộc.',
      });
    }

    const cleanSlug = (slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    const task = await Task.create({
      name: name.trim(),
      slug: cleanSlug,
      description: description || '',
      rewardCoins: Number(rewardCoins) || 10,
      dailyLimit: Number(dailyLimit) || 5,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      minDurationSeconds: Number(minDurationSeconds) || 30,
      targetUrl: targetUrl ? targetUrl.trim() : '',
      guideText: guideText ? guideText.trim() : '',
      icon: icon || 'Link',
      apiType: ['standard', 'phienchoso_json', 'lentop_json'].includes(apiType) ? apiType : 'standard',
      apiToken: apiToken ? apiToken.trim() : '',
    });

    return res.status(201).json({ success: true, task });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/tasks/admin/:id
 * Admin: Sửa nhiệm vụ (thay đổi rewardCoins, dailyLimit, apiType, apiToken, bật/tắt, v.v.)
 */
const adminUpdateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      rewardCoins,
      dailyLimit,
      isActive,
      minDurationSeconds,
      targetUrl,
      guideText,
      icon,
      apiType,
      apiToken,
    } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ' });
    }

    if (name !== undefined) task.name = name.trim();
    if (description !== undefined) task.description = description.trim();
    if (rewardCoins !== undefined) task.rewardCoins = Number(rewardCoins) || 10;
    if (dailyLimit !== undefined) task.dailyLimit = Number(dailyLimit) || 1;
    if (isActive !== undefined) task.isActive = Boolean(isActive);
    if (minDurationSeconds !== undefined) task.minDurationSeconds = Number(minDurationSeconds) || 30;
    if (targetUrl !== undefined) task.targetUrl = targetUrl.trim();
    if (guideText !== undefined) task.guideText = guideText.trim();
    if (icon !== undefined) task.icon = icon.trim();
    if (apiType !== undefined) {
      task.apiType = ['standard', 'phienchoso_json', 'lentop_json'].includes(apiType) ? apiType : 'standard';
    }
    if (apiToken !== undefined) task.apiToken = apiToken.trim();

    await task.save();

    return res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/tasks/admin/:id
 * Admin: Xóa nhiệm vụ
 */
const adminDeleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const task = await Task.findByIdAndDelete(id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ' });
    }
    return res.json({ success: true, message: `Đã xóa nhiệm vụ ${task.name}` });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tasks/admin/seed
 * Khởi tạo nhanh các mạng lưới vượt link phổ biến (TrafficVN, Link4M, PhienChoSo...)
 */
const seedDefaultTasks = async (req, res, next) => {
  try {
    const defaultTasks = [
      {
        name: 'TrafficVN (Rút gọn link uy tín)',
        slug: 'trafficvn',
        description: 'Vượt link rút gọn bảo mật qua hệ thống TrafficVN, nhận ngay 50 Coin mỗi lượt.',
        rewardCoins: 50,
        dailyLimit: 5,
        minDurationSeconds: 30,
        targetUrl: 'https://trafficvn.top/shortlink?token={token}',
        guideText: 'Bấm Vượt link -> Chờ đếm ngược 10 giây -> Bấm Lấy mã -> Xác nhận để nhận Coin.',
        icon: 'Zap',
        apiType: 'standard',
        apiToken: '',
      },
      {
        name: 'Link4M (Traffic tìm kiếm Google)',
        slug: 'link4m',
        description: 'Tìm kiếm từ khóa trên Google theo yêu cầu của Link4M để lấy mã hoàn thành.',
        rewardCoins: 40,
        dailyLimit: 5,
        minDurationSeconds: 30,
        targetUrl: 'https://link4m.co/api?token={token}',
        guideText: 'Vào Google tìm từ khóa được chỉ định -> Cuộn xuống chân trang để lấy mã OTP.',
        icon: 'Link',
        apiType: 'standard',
        apiToken: '',
      },
      {
        name: 'PhienChoSo Từ Khóa (Developer API)',
        slug: 'phienchoso-keyword',
        description: 'Tìm kiếm từ khóa trên Google theo hệ thống Phiên Chợ Số và nhận thưởng Coin tự động.',
        rewardCoins: 60,
        dailyLimit: 3,
        minDurationSeconds: 35,
        targetUrl: 'https://api.phienchoso.com/tukhoa-dev.php',
        guideText: 'Tìm từ khóa chỉ định -> Nhập mã vào PhienChoSo -> Hệ thống tự động chuyển hướng nhận Coin.',
        icon: 'Search',
        apiType: 'phienchoso_json',
        apiToken: '',
      },
      {
        name: 'PhienChoSo Review (Đánh giá Google Maps)',
        slug: 'phienchoso-review',
        description: 'Viết đánh giá 5 sao cho gian hàng đối tác trên Phiên Chợ Số để nhận thưởng lớn.',
        rewardCoins: 100,
        dailyLimit: 1,
        minDurationSeconds: 45,
        targetUrl: 'https://api.phienchoso.com/review-dev.php',
        guideText: 'Mở bản đồ Maps -> Đánh giá 5 sao kèm hình ảnh -> Gửi bằng chứng xác nhận.',
        icon: 'Star',
        apiType: 'phienchoso_json',
        apiToken: '',
      },
      {
        name: 'LenTop (Rút Gọn Link Developer API)',
        slug: 'lentop-api',
        description: 'Vượt link qua nền tảng LenTop bằng Developer API, tự động nhận shortenedUrl và chuyển hướng.',
        rewardCoins: 50,
        dailyLimit: 5,
        minDurationSeconds: 30,
        targetUrl: 'https://lentop.one/api',
        guideText: 'Vượt link qua hệ thống LenTop -> Chờ đếm ngược -> Nhận thưởng Coin tự động.',
        icon: 'Zap',
        apiType: 'lentop_json',
        apiToken: '',
      },
    ];

    let createdCount = 0;
    for (const dt of defaultTasks) {
      const existing = await Task.findOne({ slug: dt.slug });
      if (!existing) {
        await Task.create(dt);
        createdCount++;
      } else {
        // Cập nhật cấu hình mới nếu đã tồn tại
        existing.apiType = dt.apiType;
        await existing.save();
      }
    }

    return res.json({
      success: true,
      message: `Đã cập nhật/khởi tạo thành công các nhiệm vụ mặc định.`,
      createdCount,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tasks/admin/simulate
 * Admin: Công cụ kiểm thử giả lập Postback (Thử vượt hợp lệ vs Thử dùng Tool Bypass)
 */
const adminSimulatePostback = async (req, res, next) => {
  try {
    const { token, bypassSimulate } = req.body;
    req.query.token = token;
    req.body.bypassSimulate = bypassSimulate;
    return handlePostback(req, res, next);
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
