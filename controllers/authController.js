const admin = require('../config/firebase');
const pool = require('../config/db');

exports.login = async (req, res) => {
  const { token } = req.body; // Lấy token từ request body

  try {
    const decoded = await admin.auth().verifyIdToken(token); // Xác thực token với Firebase
    const { uid, email } = decoded; // Lấy thông tin user từ token đã giải mã

    // Kiểm tra xem user đã tồn tại trong PG chưa
    const result = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);
    if (result.rows.length === 0) {
      // Nếu chưa có thì thêm mới
      const { uid, email, name } = decoded ; // name chính là displayName
      await pool.query(
        'INSERT INTO users (uid, email, name) VALUES ($1, $2, $3)',
        [uid, email, name || '']
      );
      console.log(' Đã lưu user mới vào PostgreSQL');
    }

    return res.status(200).json({
      message: 'Đăng nhập thành công',
      user: { uid, email }
    });
  } catch (error) {
    console.error('Lỗi xác thực token:', error.message);
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
};
