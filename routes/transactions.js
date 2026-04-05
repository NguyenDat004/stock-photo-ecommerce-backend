// backend/routes/transactions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 💳 Tạo transaction mới (thanh toán)
router.post('/create', async (req, res) => {
  const { userId, totalAmount, items } = req.body;

  console.log('💳 Creating transaction:', { userId, totalAmount, itemCount: items.length });

  // Validate input
  if (!userId || !totalAmount || !items || items.length === 0) {
    return res.status(400).json({ 
      message: 'Thiếu thông tin: userId, totalAmount, hoặc items' 
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Tạo transaction - 
    const transactionResult = await client.query(
      `INSERT INTO transactions (user_id, total_price, total_items, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [userId, totalAmount, items.length, 'success']
    );

    const transactionId = transactionResult.rows[0].transaction_id; 
    console.log(`✅ Transaction created: ID=${transactionId}`);

    // 2. Thêm từng item vào transaction_items - 
    for (const item of items) {
      await client.query(
        `INSERT INTO transaction_items (transaction_id, user_id, photo_id, price)
         VALUES ($1, $2, $3, $4)`,
        [transactionId, userId, item.photoId, item.price]
      );
    }

    console.log(`✅ Added ${items.length} items to transaction_items`);

    await client.query('COMMIT');

    res.status(200).json({
      message: '✅ Thanh toán thành công!',
      transaction: transactionResult.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi tạo transaction:', err);
    res.status(500).json({ 
      message: 'Lỗi server khi xử lý thanh toán',
      error: err.message 
    });
  } finally {
    client.release();
  }
});

// 📋 Lấy lịch sử giao dịch của user
router.get('/history/:userId', async (req, res) => {
  const { userId } = req.params;

  console.log('📋 Get transaction history for user:', userId);

  try {
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    console.log(`✅ Found ${result.rows.length} transactions`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy lịch sử giao dịch:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy lịch sử giao dịch' });
  }
});

// GET /all - Lấy tất cả đơn hàng (cho Admin)
router.get('/all', async (req, res) => {
  console.log('📋 Get all transactions for admin');

  try {
    const result = await pool.query(
      `
      SELECT 
        t.transaction_id,
        t.user_id,
        u.full_name,
        u.email,
        t.total_price,
        t.total_items,
        t.status,
        t.created_at
      FROM transactions t
      LEFT JOIN users u 
        ON t.user_id = u.uid
      ORDER BY t.created_at DESC
      `
    );

    console.log(`✅ Found ${result.rows.length} transactions`);
    res.status(200).json(result.rows);

  } catch (err) {
    console.error('❌ Lỗi khi lấy danh sách đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách đơn hàng' });
  }
});


// 📦 Lấy chi tiết một transaction
router.get('/:transactionId', async (req, res) => {
  const { transactionId } = req.params;

  console.log('📦 Get transaction details:', transactionId);

  try {
    // Lấy thông tin transaction
    const transaction = await pool.query(
      'SELECT * FROM transactions WHERE transaction_id = $1',
      [transactionId]
    );

    if (transaction.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
    }

    // Lấy danh sách items
    const items = await pool.query(
      `SELECT ti.*, p.title, p.image_url
       FROM transaction_items ti
       JOIN photos p ON ti.photo_id = p.id
       WHERE ti.transaction_id = $1`,
      [transactionId]
    );

    res.status(200).json({
      transaction: transaction.rows[0],
      items: items.rows
    });

  } catch (err) {
    console.error('❌ Lỗi khi lấy chi tiết transaction:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy chi tiết giao dịch' });
  }
});

module.exports = router;