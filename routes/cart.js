// backend/routes/cart.js 
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 🛒 Thêm ảnh vào giỏ hàng (có kiểm tra đã mua)
router.post('/add', async (req, res) => {
  const { userId, photoId, quantity = 1 } = req.body;

  console.log('📦 Add to cart request:', { userId, photoId, quantity });

  try {
    // 1. Kiểm tra đã mua chưa
    const purchased = await pool.query(
      `SELECT 1 FROM transaction_items 
       WHERE user_id = $1 AND photo_id = $2 
       LIMIT 1`,
      [userId, photoId]
    );

    if (purchased.rowCount > 0) {
      console.log('❌ Ảnh đã được mua trước đó');
      return res.status(400).json({ 
        message: 'Bạn đã mua ảnh này rồi, không thể thêm vào giỏ hàng!' 
      });
    }

    // 2. Kiểm tra đã có trong giỏ hàng chưa
    const existing = await pool.query(
      'SELECT * FROM carts WHERE user_id = $1 AND photo_id = $2',
      [userId, photoId]
    );

    if (existing.rows.length > 0) {
      // Nếu đã có, tăng số lượng
      await pool.query(
        'UPDATE carts SET quantity = quantity + $1 WHERE user_id = $2 AND photo_id = $3',
        [quantity, userId, photoId]
      );
      console.log('✅ Đã cập nhật số lượng');
      return res.status(200).json({ message: '✔️ Đã cập nhật số lượng trong giỏ hàng' });
    } else {
      // Nếu chưa có, thêm mới
      await pool.query(
        'INSERT INTO carts (user_id, photo_id, quantity) VALUES ($1, $2, $3)',
        [userId, photoId, quantity]
      );
      console.log('✅ Đã thêm vào giỏ hàng');
      return res.status(200).json({ message: '✔️ Đã thêm vào giỏ hàng' });
    }

  } catch (err) {
    console.error('❌ Lỗi khi thêm vào giỏ hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi thêm vào giỏ hàng' });
  }
});

// 📋 Lấy giỏ hàng của người dùng
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  console.log('📋 Get cart for user:', userId);

  try {
    const result = await pool.query(
      `SELECT c.id, p.id AS photo_id, p.title, p.image_url, p.price, c.quantity
       FROM carts c
       JOIN photos p ON c.photo_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    console.log(`✅ Found ${result.rows.length} items in cart`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy giỏ hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy giỏ hàng' });
  }
});

// 🗑️ Xoá một ảnh khỏi giỏ
router.delete('/:userId/:photoId', async (req, res) => {
  const { userId, photoId } = req.params;

  console.log('🗑️ Delete from cart:', { userId, photoId });

  try {
    const result = await pool.query(
      'DELETE FROM carts WHERE user_id = $1 AND photo_id = $2 RETURNING *',
      [userId, photoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy ảnh trong giỏ hàng' });
    }

    console.log('✅ Đã xóa khỏi giỏ hàng');
    res.status(200).json({ message: '🗑️ Đã xoá ảnh khỏi giỏ hàng' });
  } catch (err) {
    console.error('❌ Lỗi khi xoá ảnh khỏi giỏ hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi xoá ảnh' });
  }
});

// 🔄 Cập nhật số lượng trong giỏ hàng
router.put('/:userId/:photoId', async (req, res) => {
  const { userId, photoId } = req.params;
  const { quantity } = req.body;

  console.log('🔄 Update cart quantity:', { userId, photoId, quantity });

  try {
    if (quantity <= 0) {
      return res.status(400).json({ message: 'Số lượng phải lớn hơn 0' });
    }

    const result = await pool.query(
      'UPDATE carts SET quantity = $1 WHERE user_id = $2 AND photo_id = $3 RETURNING *',
      [quantity, userId, photoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy ảnh trong giỏ hàng' });
    }

    console.log('✅ Đã cập nhật số lượng');
    res.status(200).json({ 
      message: '✔️ Đã cập nhật số lượng',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật số lượng:', err);
    res.status(500).json({ message: 'Lỗi server khi cập nhật số lượng' });
  }
});

// 📊 Lấy danh sách ảnh đã mua của user
router.get('/purchased/:userId', async (req, res) => {
  const { userId } = req.params;

  console.log('📊 Get purchased photos for user:', userId);

  try {
    const result = await pool.query(
      `SELECT DISTINCT ti.photo_id, p.title, p.image_url, p.price, ti.created_at
       FROM transaction_items ti
       JOIN photos p ON ti.photo_id = p.id
       WHERE ti.user_id = $1
       ORDER BY ti.created_at DESC`,
      [userId]
    );

    console.log(`✅ Found ${result.rows.length} purchased photos`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy danh sách ảnh đã mua:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách ảnh đã mua' });
  }
});

// 🧹 Xóa toàn bộ giỏ hàng (sau khi checkout thành công)
router.delete('/clear/:userId', async (req, res) => {
  const { userId } = req.params;

  console.log('🧹 Clear cart for user:', userId);

  try {
    const result = await pool.query(
      'DELETE FROM carts WHERE user_id = $1 RETURNING *',
      [userId]
    );

    console.log(`✅ Cleared ${result.rows.length} items from cart`);
    res.status(200).json({ 
      message: '🧹 Đã xóa toàn bộ giỏ hàng',
      deletedCount: result.rows.length
    });
  } catch (err) {
    console.error('❌ Lỗi khi xóa giỏ hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi xóa giỏ hàng' });
  }
});

module.exports = router;