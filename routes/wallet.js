// wallet.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middlewares/authMiddleware");

// =======================================
// 1. USER XEM SỐ DƯ VÍ
// =======================================
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.db_id;

    // Lấy ví
    let wallet = await pool.query(
      "SELECT balance, total_earned FROM wallets WHERE user_id = $1",
      [userId]
    );

    // Nếu chưa có ví → tạo tự động
    if (wallet.rowCount === 0) {
      const newWallet = await pool.query(
        `INSERT INTO wallets (user_id, balance, total_earned)
         VALUES ($1, 0, 0)
         RETURNING balance, total_earned`,
        [userId]
      );
      wallet = newWallet;
    }

    // Lấy lịch sử giao dịch ví
    const history = await pool.query(
      `SELECT 
          id,
          amount,
          transaction_type AS type,   -- FE dùng tx.type
          description,
          created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      balance: wallet.rows[0].balance,
      transactions: history.rows
    });

  } catch (err) {
    console.error("Wallet Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// =======================================
// 2. ADMIN XEM TẤT CẢ VÍ NGƯỜI DÙNG
// =======================================
// (Nếu bạn có hệ thống phân quyền, thêm middleware kiểm tra admin)
router.get("/admin/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, u.name, u.email
      FROM wallets w
      LEFT JOIN users u ON w.user_id = u.id
      ORDER BY w.balance DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Admin Wallet Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================================
// 3. NẠP TIỀN TEST (không dùng production)
// =======================================
// Dùng để test: POST /wallet/add
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.db_id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Số tiền không hợp lệ" });
    }

    // Đảm bảo ví tồn tại
    await pool.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Cộng số dư
    await pool.query(
      "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
      [amount, userId]
    );

    res.json({ message: "Đã nạp tiền test" });

  } catch (err) {
    console.error("Add Money Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
