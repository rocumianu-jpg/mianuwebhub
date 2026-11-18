'use strict';

const NavigationMenu = require('../models/NavigationMenu');

const DEFAULT_MENU_ITEMS = [
  { id: 'nav_shop', label: 'Cửa Hàng Dịch Vụ', href: '/shop', icon: 'ShoppingCart', order: 1, isVisible: true },
  { id: 'nav_news', label: 'Tin Tức & Thông Báo', href: '/news', icon: 'Newspaper', order: 2, isVisible: true, badge: 'MỚI' },
  { id: 'nav_deposit', label: 'Nạp Tiền / Thẻ Cào', href: '/deposit', icon: 'CreditCard', order: 3, isVisible: true },
  { id: 'nav_my_orders', label: 'Đơn Hàng Của Tôi', href: '/my-orders', icon: 'ClipboardList', order: 4, isVisible: true },
  { id: 'nav_feedbacks', label: 'Đánh Giá Khách Hàng', href: '/feedbacks', icon: 'Star', order: 5, isVisible: true },
  { id: 'nav_tasks', label: 'Nhiệm Vụ Kiếm Coin', href: '/tasks', icon: 'Coins', order: 6, isVisible: true },
  { id: 'nav_giftcodes', label: 'Mã Quà Tặng (Giftcode)', href: '/giftcodes', icon: 'Gift', order: 7, isVisible: true },
  { id: 'nav_support', label: 'Hỗ Trợ (Ticket)', href: '/support', icon: 'LifeBuoy', order: 8, isVisible: true },
  { id: 'nav_settings', label: 'Cài Đặt Tài Khoản', href: '/settings', icon: 'Settings', order: 9, isVisible: true },
];

/**
 * GET /api/navigation
 * Lấy danh sách các nút điều hướng (Menu items)
 */
const getMenu = async (req, res, next) => {
  try {
    let menu = await NavigationMenu.findOne({ key: 'main_user_nav' });

    if (!menu || !menu.items || menu.items.length === 0) {
      menu = await NavigationMenu.findOneAndUpdate(
        { key: 'main_user_nav' },
        { key: 'main_user_nav', items: DEFAULT_MENU_ITEMS },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Sắp xếp theo order tăng dần
    const sortedItems = [...menu.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.json({
      success: true,
      items: sortedItems,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/navigation/admin
 * Admin cập nhật danh sách menu (thứ tự, tên hiển thị, ẩn/hiện, icon)
 */
const adminUpdateMenu = async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu menu phải là một danh sách hợp lệ',
      });
    }

    const sanitizedItems = items.map((item, index) => ({
      id: item.id || `nav_custom_${Date.now()}_${index}`,
      label: (item.label || 'Mục Menu').trim(),
      href: (item.href || '/').trim(),
      icon: (item.icon || 'Circle').trim(),
      order: typeof item.order === 'number' ? item.order : index + 1,
      isVisible: item.isVisible !== false,
      isExternal: Boolean(item.isExternal),
      badge: item.badge ? item.badge.trim() : '',
    }));

    const menu = await NavigationMenu.findOneAndUpdate(
      { key: 'main_user_nav' },
      { key: 'main_user_nav', items: sanitizedItems },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const sortedItems = [...menu.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.json({
      success: true,
      message: 'Cập nhật cấu hình Menu điều hướng thành công',
      items: sortedItems,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/navigation/admin/reset
 * Khôi phục menu điều hướng về trạng thái mặc định ban đầu
 */
const adminResetMenu = async (req, res, next) => {
  try {
    const menu = await NavigationMenu.findOneAndUpdate(
      { key: 'main_user_nav' },
      { key: 'main_user_nav', items: DEFAULT_MENU_ITEMS },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: 'Đã khôi phục menu điều hướng về mặc định thành công',
      items: menu.items,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMenu,
  adminUpdateMenu,
  adminResetMenu,
  DEFAULT_MENU_ITEMS,
};
