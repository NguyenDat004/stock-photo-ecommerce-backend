const express = require('express');
const router = express.Router();
const pool = require('../../config/db');

// ==================== HELPER FUNCTIONS ====================

/**
 * Lấy thống kê tổng quan
 */
const getOverviewStats = async () => {
  const queries = [
    { key: 'totalPhotos', sql: 'SELECT COUNT(*) as count FROM photos' },
    { key: 'totalCategories', sql: 'SELECT COUNT(*) as count FROM categories' },
    { key: 'totalUsers', sql: 'SELECT COUNT(*) as count FROM users' },
    { key: 'totalTransactions', sql: 'SELECT COUNT(*) as count FROM transactions' },
    {
      key: 'totalRevenue',
      sql: 'SELECT COALESCE(SUM(total_price), 0) as total FROM transactions WHERE status = $1',
      params: ['success']
    },
    {
      key: 'pendingOrders',
      sql: 'SELECT COUNT(*) as count FROM transactions WHERE status = $1',
      params: ['pending']
    }
  ];

  const results = {};

  for (const query of queries) {
    try {
      const result = await pool.query(query.sql, query.params || []);
      results[query.key] = query.key === 'totalRevenue'
        ? parseFloat(result.rows[0].total)
        : parseInt(result.rows[0].count);
    } catch (err) {
      console.error(`❌ Error in ${query.key}:`, err.message);
      results[query.key] = 0;
    }
  }

  return results;
};

/**
 * 12 tháng gần nhất
 */
const getRevenueByMonth = async () => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        TO_CHAR(created_at, 'Mon YYYY') AS month_name,
        COUNT(*) as total_orders,
        COALESCE(SUM(total_price), 0) AS revenue
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '12 months'
        AND status = $1
      GROUP BY month, month_name
      ORDER BY month ASC
    `, ['success']);

    return result.rows.map(row => ({
      month: row.month,
      monthName: row.month_name,
      orders: parseInt(row.total_orders),
      revenue: parseFloat(row.revenue)
    }));
  } catch (err) {
    console.error('❌ Error getRevenueByMonth:', err.message);
    return [];
  }
};

/**
 * Doanh thu 30 ngày gần nhất
 */
const getRevenueByDay = async () => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) AS date,
        COUNT(*) as total_orders,
        COALESCE(SUM(total_price), 0) AS revenue
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND status = $1
      GROUP BY date
      ORDER BY date ASC
    `, ['success']);

    return result.rows.map(row => ({
      date: row.date,
      orders: parseInt(row.total_orders),
      revenue: parseFloat(row.revenue)
    }));
  } catch (err) {
    console.error('❌ Error getRevenueByDay:', err.message);
    return [];
  }
};

/**
 * Top ảnh bán chạy – FIXED thumbnail field
 */
const getTopSellingPhotos = async (limit = 10) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.price,
        p.image_url,
        c.category_name,
        COUNT(ti.photo_id) AS sold,
        COALESCE(SUM(ti.price), 0) as total_revenue
      FROM photos p
      LEFT JOIN transaction_items ti ON p.id = ti.photo_id
      LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id AND t.status = $1
      LEFT JOIN categories c ON p.category_id = c.category_id
      GROUP BY p.id, p.title, p.price, p.image_url, c.category_name
      ORDER BY sold DESC, total_revenue DESC
      LIMIT $2
    `, ['success', limit]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      price: parseFloat(row.price),
      thumbnail: row.image_url, // FIXED
      category: row.category_name,
      sold: parseInt(row.sold),
      revenue: parseFloat(row.total_revenue)
    }));
  } catch (err) {
    console.error('❌ Error getTopSellingPhotos:', err.message);
    return [];
  }
};

/**
 * Top danh mục – FIXED id & name
 */
const getTopCategories = async (limit = 5) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.category_id,
        c.category_name,
        COUNT(DISTINCT p.id) as total_photos,
        COUNT(ti.id) as total_sold,
        COALESCE(SUM(ti.price), 0) as revenue
      FROM categories c
      LEFT JOIN photos p ON c.category_id = p.category_id
      LEFT JOIN transaction_items ti ON p.id = ti.photo_id
      LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id AND t.status = $1
      GROUP BY c.category_id, c.category_name
      ORDER BY total_sold DESC, revenue DESC
      LIMIT $2
    `, ['success', limit]);

    return result.rows.map(row => ({
      id: row.category_id, // FIXED
      name: row.category_name, // FIXED
      totalPhotos: parseInt(row.total_photos),
      sold: parseInt(row.total_sold),
      revenue: parseFloat(row.revenue)
    }));
  } catch (err) {
    console.error('❌ Error getTopCategories:', err.message);
    return [];
  }
};

/**
 * Top khách hàng – FIXED username & avatar
 */
const getTopCustomers = async (limit = 5) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.uid,
        u.full_name,
        u.email,
        u.avatar_url,
        COUNT(DISTINCT t.transaction_id) as total_orders,
        COUNT(ti.id) as total_items,
        COALESCE(SUM(t.total_price), 0) as total_spent
      FROM users u
      INNER JOIN transactions t ON u.uid::text = t.user_id AND t.status = $1
      LEFT JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
      GROUP BY u.uid, u.full_name, u.email, u.avatar_url
      ORDER BY total_spent DESC, total_orders DESC
      LIMIT $2
    `, ['success', limit]);

    return result.rows.map(row => ({
      id: row.id,
      fullName: row.full_name, // FIXED
      email: row.email,
      avatar: row.avatar_url, // FIXED
      orders: parseInt(row.total_orders),
      items: parseInt(row.total_items),
      spent: parseFloat(row.total_spent)
    }));
  } catch (err) {
    console.error('❌ Error getTopCustomers:', err.message);
    return [];
  }
};

/**
 * Giao dịch gần đây – FIXED id & username
 */
const getRecentTransactions = async (limit = 10) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.transaction_id,
        t.total_price,
        t.status,
        t.created_at,
        u.full_name,
        u.email,
        COUNT(ti.id) as total_items
      FROM transactions t
      INNER JOIN users u ON t.user_id = u.uid::text
      LEFT JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
      GROUP BY t.transaction_id, t.total_price, t.status, t.created_at, u.full_name, u.email
      ORDER BY t.created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      id: row.transaction_id, // FIXED
      totalPrice: parseFloat(row.total_price),
      status: row.status,
      createdAt: row.created_at,
      fullName: row.full_name, // FIXED
      email: row.email,
      items: parseInt(row.total_items)
    }));
  } catch (err) {
    console.error('❌ Error getRecentTransactions:', err.message);
    return [];
  }
};

/**
 * Người dùng mới 30 ngày
 */
const getNewUsersStats = async () => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date ASC
    `);

    return result.rows.map(row => ({
      date: row.date,
      newUsers: parseInt(row.new_users)
    }));
  } catch (err) {
    console.error('❌ Error getNewUsersStats:', err.message);
    return [];
  }
};

/**
 * So sánh tháng này vs tháng trước
 */
const getRevenueComparison = async () => {
  try {
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 'current'
          WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
            AND created_at < DATE_TRUNC('month', CURRENT_DATE) THEN 'previous'
        END as period,
        COALESCE(SUM(total_price), 0) as revenue,
        COUNT(*) as orders
      FROM transactions
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND status = $1
      GROUP BY period
    `, ['success']);

    const data = {
      currentMonth: { revenue: 0, orders: 0 },
      previousMonth: { revenue: 0, orders: 0 },
      growth: { revenue: 0, orders: 0 }
    };

    result.rows.forEach(row => {
      if (row.period === 'current') {
        data.currentMonth.revenue = parseFloat(row.revenue);
        data.currentMonth.orders = parseInt(row.orders);
      } else if (row.period === 'previous') {
        data.previousMonth.revenue = parseFloat(row.revenue);
        data.previousMonth.orders = parseInt(row.orders);
      }
    });

    if (data.previousMonth.revenue > 0) {
      data.growth.revenue =
        ((data.currentMonth.revenue - data.previousMonth.revenue) /
          data.previousMonth.revenue) * 100;
    }

    if (data.previousMonth.orders > 0) {
      data.growth.orders =
        ((data.currentMonth.orders - data.previousMonth.orders) /
          data.previousMonth.orders) * 100;
    }

    return data;
  } catch (err) {
    console.error('❌ Error getRevenueComparison:', err.message);
    return {
      currentMonth: { revenue: 0, orders: 0 },
      previousMonth: { revenue: 0, orders: 0 },
      growth: { revenue: 0, orders: 0 }
    };
  }
};

// ==================== ROUTES ====================

router.get('/dashboard', async (req, res) => {
  console.log('📊 Request to /api/admin/dashboard');

  try {
    const [
      overview,
      revenueByMonth,
      revenueByDay,
      topPhotos,
      topCategories,
      topCustomers,
      recentTransactions,
      newUsers,
      revenueComparison
    ] = await Promise.all([
      getOverviewStats(),
      getRevenueByMonth(),
      getRevenueByDay(),
      getTopSellingPhotos(10),
      getTopCategories(5),
      getTopCustomers(5),
      getRecentTransactions(10),
      getNewUsersStats(),
      getRevenueComparison()
    ]);

    res.json({
      overview,
      revenueByMonth,
      revenueByDay,
      topPhotos,
      topCategories,
      topCustomers,
      recentTransactions,
      newUsers,
      revenueComparison,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Dashboard error:', err);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
});

module.exports = router;
