const admin = require('../config/firebase'); // Firebase Admin SDK
const pool = require('../config/db'); // Kết nối DB

/**
 * Middleware xác thực Firebase Token và lấy thông tin người dùng từ cơ sở dữ liệu.
 */
const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Lấy token từ header Authorization

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token!' });
  }

  try {
    // Xác thực token với Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Lấy thông tin người dùng từ cơ sở dữ liệu
    const { rows } = await pool.query(
      'SELECT id, email, full_name, role FROM users WHERE email = $1',
      [decodedToken.email]
    );

    if (rows.length > 0) {
      // Gắn thông tin người dùng vào req.user
      req.user = {
        ...decodedToken,
        role: rows[0].role, // Vai trò (admin, user, ...)
        full_name: rows[0].full_name, // Tên đầy đủ
        db_id: rows[0].id, // ID trong cơ sở dữ liệu
        dbUser: rows[0], // Toàn bộ thông tin từ DB (giữ lại để tương thích code cũ)
      };

      console.log('✅ User authenticated:', {
        uid: req.user.uid,
        email: req.user.email,
        role: req.user.role,
      });
    } else {
      // Nếu người dùng chưa có trong cơ sở dữ liệu
      req.user = {
        ...decodedToken,
        role: 'user', // Gán vai trò mặc định là "user"
      };

      console.log('⚠️ User chưa có trong database');
    }

    next(); // Tiếp tục xử lý request
  } catch (error) {
    console.error('❌ Lỗi xác thực Firebase:', error);
    return res.status(401).json({ message: 'Token không hợp lệ!' });
  }
};

module.exports = verifyFirebaseToken;