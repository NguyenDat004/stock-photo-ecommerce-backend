const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middlewares/authMiddleware'); // Middleware xác thực người dùng

// GET /api/downloads/:userId - Lấy danh sách ảnh đã mua
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
        SELECT p.id as photo_id, p.title, p.image_url, ti.price, t.created_at
        FROM transactions t
        JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
        JOIN photos p ON ti.photo_id = p.id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy ảnh đã mua:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy ảnh đã mua' });
  }
});

module.exports = router;
