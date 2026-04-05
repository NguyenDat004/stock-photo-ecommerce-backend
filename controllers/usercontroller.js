const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const pool = require("../config/db");

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Hàm cập nhật avatar
exports.updateAvatar = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Không có file nào được tải lên" });
    }

    // Upload ảnh lên Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "avatars",
    });

    // Xóa file tạm sau khi upload
    fs.unlinkSync(req.file.path);

    // Lưu URL vào PostgreSQL
    await pool.query(
      "UPDATE users SET avatar_url = $1 WHERE uid = $2",
      [result.secure_url, uid]
    );

    res.json({ avatar: result.secure_url });
  } catch (err) {
    console.error("Lỗi update avatar:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};