// withdraw.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middlewares/authMiddleware");

// ==============================
// 1. USER GỬI YÊU CẦU RÚT TIỀN
// ==============================
router.post("/request", authMiddleware, async (req, res) => {
  try {
    const { amount, bank_name, bank_account } = req.body;
    const userId = req.user.db_id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Số tiền không hợp lệ" });
    }

    if (!bank_name || !bank_account) {
      return res.status(400).json({ message: "Thiếu thông tin ngân hàng" });
    }

    // Lấy số dư ví
    const wallet = await pool.query(
      "SELECT balance FROM wallets WHERE user_id = $1",
      [userId]
    );

    if (wallet.rowCount === 0) {
      return res.status(400).json({ message: "User chưa có ví" });
    }

    if (wallet.rows[0].balance < amount) {
      return res.status(400).json({ message: "Số dư không đủ" });
    }

    // Tạo yêu cầu rút tiền
    const result = await pool.query(
      `INSERT INTO withdraw_requests 
        (user_id, amount, bank_name, bank_account, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING *`,
      [userId, amount, bank_name, bank_account]
    );

    res.json({
      message: "Đã tạo yêu cầu rút tiền",
      withdraw: result.rows[0]
    });

  } catch (err) {
    console.error("Withdraw Request Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ===========================================
// 2. ADMIN LẤY TẤT CẢ YÊU CẦU RÚT TIỀN
// ===========================================
router.get("/admin/list", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT wr.*, u.full_name AS user_name, u.email
      FROM withdraw_requests wr
      LEFT JOIN users u ON wr.user_id = u.id
      ORDER BY wr.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Admin List Withdraw Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================================================
// 3. ADMIN PHÊ DUYỆT YÊU CẦU RÚT TIỀN (approve / reject)
// =========================================================
router.put("/admin/update/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const requestId = req.params.id;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }

    const withdraw = await pool.query(
      "SELECT * FROM withdraw_requests WHERE request_id = $1",
      [requestId]
    );

    if (withdraw.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
    }

    const data = withdraw.rows[0];

    // Nếu admin approve → trừ tiền + ghi lịch sử ví
    if (status === "approved") {
      // Trừ tiền ví
      await pool.query(
        "UPDATE wallets SET balance = balance - $1 WHERE user_id = $2",
        [data.amount, data.user_id]
      );

      // Ghi lịch sử giao dịch ví
      await pool.query(
        `INSERT INTO wallet_transactions (user_id, amount, transaction_type, description)
         VALUES ($1, $2, 'withdraw', $3)`,
        [data.user_id, -data.amount, `Rút tiền về ngân hàng`]
      );
    }

    // Cập nhật trạng thái
    await pool.query(
      `UPDATE withdraw_requests
       SET status = $1, processed_at = NOW()
       WHERE request_id = $2`,
      [status, requestId]
    );

    res.json({ message: `Yêu cầu đã được ${status}` });

  } catch (err) {
    console.error("Admin Update Withdraw Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ===========================================
// 4. USER XEM LỊCH SỬ RÚT TIỀN
// ===========================================
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.db_id;

    const result = await pool.query(
      `SELECT * FROM withdraw_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Withdraw History Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
