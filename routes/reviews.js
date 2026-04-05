const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middlewares/authMiddleware'); // Middleware xác thực token

// Route: Thêm review mới
router.post('/', verifyToken, async (req, res) => {
  const { photo_id, user_id, rating, comment, user_name } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO reviews (photo_id, user_id, rating, comment, user_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [photo_id, user_id, rating, comment, user_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Lỗi khi thêm review:', err);
    res.status(500).json({ message: 'Lỗi server khi thêm review' });
  }
});

// Route: Lấy danh sách review theo PhotoID
router.get('/:photoId', async (req, res) => {
  const { photoId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM reviews WHERE photo_id = $1 ORDER BY created_at DESC',
      [photoId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy review:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy review' });
  }
});

// Route: Xoá review (admin hoặc chủ review)
router.delete('/:reviewId', verifyToken, async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.uid; // từ middleware
  const userRole = req.user.role; // từ middleware nếu có

  try {
    // Lấy review để kiểm tra chủ sở hữu
    const reviewRes = await pool.query('SELECT user_id FROM reviews WHERE review_id = $1', [reviewId]);

    if (reviewRes.rows.length === 0) {
      return res.status(404).json({ message: 'Review không tồn tại' });
    }

    const review = reviewRes.rows[0];

    // Kiểm tra quyền: admin hoặc chính chủ
    if (userRole === 'admin' || review.user_id === userId) {
      // Xoá review
      await pool.query('DELETE FROM reviews WHERE review_id = $1', [reviewId]);
      return res.json({ message: 'Đã xoá review thành công' });
    } else {
      return res.status(403).json({ message: 'Bạn không có quyền xoá review này' });
    }
  } catch (err) {
    console.error('❌ Lỗi khi xoá review:', err);
    res.status(500).json({ message: 'Lỗi server khi xoá review' });
  }
});

module.exports = router;
