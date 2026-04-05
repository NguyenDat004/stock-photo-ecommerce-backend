const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/checkout – Lấy giỏ hàng
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.db_id;

  const cart = await pool.query(
    `SELECT c.photo_id, p.title, p.thumbnail, p.price
     FROM carts c
     JOIN photos p ON p.id = c.photo_id
     WHERE c.user_id = $1`,
    [userId]
  );

  const total = cart.rows.reduce((s, i) => s + Number(i.price), 0);

  res.json({
    items: cart.rows,
    total,
  });
});

module.exports = router;
