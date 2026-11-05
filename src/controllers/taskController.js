'use strict';

const crypto = require('crypto');
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
 * POST /api/tasks/:id/start
 * Khởi tạo phiên làm nhiệm vụ (lưu clickTime cho Anti-Cheat bẫy thời gian)
 */
const startTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;
    const { start, end } = getTodayRange();

    const task = await Task.findById(taskId);
    if (!task || !task.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Nhiệm vụ không tồn tại hoặc đã tạm dừng.',
      });
    }

    // Kiểm tra giới hạn ngày
    const completedToday = await TaskHistory.countDocuments({
      userId,
      taskId: task._id,
      status: 'completed',
      createdAt: { $gte: start, $lte: end },
    });

    if (completedToday >= task.dailyLimit) {
      return res.status(400).json({
        success: false,
        message: `Bạn đã đạt giới hạn tối đa của nhiệm vụ ${task.name} trong ngày hôm nay (${task.dailyLimit} lần/ngày). Vui lòng quay lại vào ngày mai!`,
      });
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
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      note: 'Bắt đầu vượt link',
    });

    // Tạo link đích cho user
    let redirectUrl = task.targetUrl || '';
    if (redirectUrl) {
      redirectUrl = redirectUrl
        .replace('{token}', sessionToken)
        .replace('{userId}', userId.toString())
        .replace('{sessionToken}', sessionToken);
      if (!redirectUrl.includes(sessionToken)) {
        const separator = redirectUrl.includes('?') ? '&' : '?';
        redirectUrl = `${redirectUrl}${separator}token=${sessionToken}&userId=${userId}`;
      }
    } else {
      // URL mặc định dẫn tới trang mô phỏng hướng dẫn nếu mạng chưa có URL thực tế
      redirectUrl = `https://trafficvn.top/shortlink?token=${sessionToken}&uid=${userId}`;
    }

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
    next(err);
  }
};

/**
 * GET & POST /api/tasks/postback
 * Webhook nhận kết quả từ bên thứ 3 (Link4M, TrafficVN, PhienChoSo...)
 * Kèm LỚP PHÒNG THỦ ANTI-CHEAT (BẪY THỜI GIAN & GIỚI HẠN NGÀY)
 */
const handlePostback = async (req, res, next) => {
  try {
    const params = { ...req.query, ...req.body };
    const token = params.token || params.sessionToken || params.session_token || params.order_id;
    const bypassSimulate = params.bypassSimulate === true || params.bypassSimulate === 'true';

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu tham số token nhận dạng phiên (sessionToken).',
      });
    }

    const taskHistory = await TaskHistory.findOne({ sessionToken: token });
    if (!taskHistory) {
      return res.status(404).json({
        success: false,
        message: 'Mã phiên token không hợp lệ hoặc không tìm thấy trên hệ thống.',
      });
    }

    if (taskHistory.status === 'completed') {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'Phiên nhiệm vụ này đã được xác nhận hoàn thành trước đó.',
        rewardCoins: taskHistory.rewardCoins,
      });
    }

    if (taskHistory.status === 'cheated') {
      return res.status(400).json({
        success: false,
        cheated: true,
        message: 'Phiên làm nhiệm vụ này đã bị đánh dấu gian lận và khóa vĩnh viễn.',
      });
    }

    const task = await Task.findById(taskHistory.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Nhiệm vụ liên quan không tồn tại.',
      });
    }

    const user = await User.findById(taskHistory.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Người dùng sở hữu phiên không tồn tại.',
      });
    }

    const now = new Date();
    const minDuration = task.minDurationSeconds || 30;

    // Tính độ lệch thời gian giữa lúc bấm clickTime và lúc gọi Postback
    let elapsedSeconds = (now.getTime() - new Date(taskHistory.clickTime).getTime()) / 1000;

    // Nếu là chế độ kiểm thử bypass simulate do admin yêu cầu
    if (bypassSimulate) {
      elapsedSeconds = 5; // Cố tình ép thời gian hoàn thành là 5 giây để kích hoạt bẫy
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
 * Admin: Tạo nhiệm vụ mới
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
    });

    return res.status(201).json({ success: true, task });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/tasks/admin/:id
 * Admin: Sửa nhiệm vụ (thay đổi rewardCoins, dailyLimit, bật/tắt, v.v.)
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
      },
      {
        name: 'PhienChoSo Review (Đánh giá Google Maps)',
        slug: 'phienchoso-review',
        description: 'Viết đánh giá 5 sao cho gian hàng đối tác trên Phiên Chợ Số để nhận thưởng lớn.',
        rewardCoins: 100,
        dailyLimit: 1,
        minDurationSeconds: 45,
        targetUrl: 'https://phienchoso.com/review?token={token}',
        guideText: 'Mở bản đồ Maps -> Đánh giá 5 sao kèm hình ảnh -> Gửi bằng chứng xác nhận.',
        icon: 'Star',
      },
      {
        name: 'PhienChoSo Từ Khóa (SEO Traffic)',
        slug: 'phienchoso-keyword',
        description: 'Tìm kiếm từ khóa thương hiệu trên trình duyệt và duyệt web trong 45 giây.',
        rewardCoins: 60,
        dailyLimit: 3,
        minDurationSeconds: 35,
        targetUrl: 'https://phienchoso.com/search?token={token}',
        guideText: 'Tìm kiếm trên Google và ở lại trang web ít nhất 35 giây để nhận mã.',
        icon: 'Search',
      },
    ];

    let createdCount = 0;
    for (const dt of defaultTasks) {
      const existing = await Task.findOne({ slug: dt.slug });
      if (!existing) {
        await Task.create(dt);
        createdCount++;
      }
    }

    return res.json({
      success: true,
      message: `Đã khởi tạo thành công ${createdCount} nhiệm vụ mặc định.`,
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
