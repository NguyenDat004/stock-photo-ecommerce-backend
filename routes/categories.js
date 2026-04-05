const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/categories – Lấy danh sách danh mục kèm số ảnh
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.category_id, 
        c.category_name,
        COUNT(p.id) AS photo_count
      FROM categories c
      LEFT JOIN photos p ON c.category_id = p.category_id
      GROUP BY c.category_id, c.category_name
      ORDER BY c.category_name
    `);

    const categories = result.rows.map(row => ({
      id: row.category_id,
      name: row.category_name,
      photo_count: parseInt(row.photo_count, 10),
    }));

    res.json(categories);
  } catch (err) {
    console.error('❌ Lỗi khi lấy danh mục:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi lấy danh mục ảnh' });
  }
});


// POST /api/categories – Thêm danh mục mới
router.post('/', async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Tên danh mục không được để trống' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id, category_name',
      [name.trim()]
    );

    const newCategory = {
      id: result.rows[0].category_id,
      name: result.rows[0].category_name,
    };

    res.status(201).json(newCategory);
  } catch (err) {
    console.error('❌ Lỗi khi thêm danh mục:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi thêm danh mục ảnh' });
  }
});

// DELETE /api/categories/:id – Xoá danh mục
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM categories WHERE category_id = $1', [id]);
    res.status(200).json({ message: 'Đã xoá danh mục' });
  } catch (err) {
    console.error('❌ Lỗi khi xoá danh mục:', err);
    res.status(500).json({ message: 'Lỗi khi xoá danh mục' });
  }
});

// PUT /api/categories/:id – Cập nhật danh mục
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Tên danh mục không được để trống' });
  }

  try {
    const result = await pool.query(
      'UPDATE categories SET category_name = $1 WHERE category_id = $2 RETURNING category_id, category_name',
      [name.trim(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Danh mục không tồn tại' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật danh mục:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật danh mục' });
  }
});



module.exports = router;
