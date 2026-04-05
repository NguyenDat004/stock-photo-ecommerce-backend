const express = require('express');
const router = express.Router();
const admin = require('../config/firebase');
const pool = require('../config/db');

// Login
router.post('/login', async (req, res) => {
  const { token } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email } = decodedToken;

    const userCheck = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);

    let dbUserId;

    if (userCheck.rows.length === 0) {
      const insertUser = await pool.query(
        'INSERT INTO users (uid, email) VALUES ($1, $2) RETURNING id',
        [uid, email]
      );

      dbUserId = insertUser.rows[0].id;

      await pool.query(
        'INSERT INTO wallets (user_id) VALUES ($1)',
        [dbUserId]
      );

      console.log("🎉 Ví mới đã được tạo cho user (login lần đầu)");
    } else {
      dbUserId = userCheck.rows[0].id;
    }

    return res.json({
      message: 'Đăng nhập thành công',
      user: { uid, email, db_id: dbUserId },
    });
  } catch (err) {
    console.error('Lỗi xác thực:', err);
    res.status(401).json({ message: 'Xác thực thất bại' });
  }
});

// Register
router.post('/register', async (req, res) => {
  const { token, fullName, email } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid } = decodedToken;

    const userCheck = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);

    if (userCheck.rows.length > 0) {
      return res.status(200).json({ message: 'Người dùng đã tồn tại' });
    }

    const newUser = await pool.query(
      'INSERT INTO users (uid, full_name, email) VALUES ($1, $2, $3) RETURNING id',
      [uid, fullName, email]
    );

    const newUserId = newUser.rows[0].id;

    await pool.query(
      'INSERT INTO wallets (user_id) VALUES ($1)',
      [newUserId]
    );

    console.log("🎉 Ví mới đã được tạo cho user (đăng ký)");

    return res.status(201).json({
      message: 'Đăng ký thành công',
      user: { uid, fullName, email, db_id: newUserId }
    });

  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    res.status(500).json({ message: 'Lỗi đăng ký người dùng' });
  }
});

// GOOGLE LOGIN
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Thiếu Google token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email;
    const fullName = decoded.name || "Google User";

    const userCheck = await pool.query(
      "SELECT * FROM users WHERE uid = $1",
      [uid]
    );

    let dbUserId;

    if (userCheck.rows.length === 0) {
      const insertUser = await pool.query(
        `INSERT INTO users (uid, full_name, email)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [uid, fullName, email]
      );

      dbUserId = insertUser.rows[0].id;

      await pool.query(
        "INSERT INTO wallets (user_id) VALUES ($1)",
        [dbUserId]
      );

      console.log("🎉 Ví mới đã được tạo cho user Google");
    } else {
      dbUserId = userCheck.rows[0].id;
    }

    res.json({
      message: "Google login/register success",
      user: { uid, email, fullName, db_id: dbUserId }
    });

  } catch (error) {
    console.error("❌ Google Login Error:", error);
    res.status(500).json({ message: "Google login failed" });
  }
});

module.exports = router;
