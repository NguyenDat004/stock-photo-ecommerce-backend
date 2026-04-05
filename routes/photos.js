// backend/routes/photos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require("multer");
const Jimp = require("jimp");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const authMiddleware = require("../middlewares/authMiddleware");
require("dotenv").config();

// Multer setup
const upload = multer({ dest: "uploads/" });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// ========== ADMIN ROUTES (MỚI) ==========

// GET /all-admin – TẤT CẢ ảnh kèm sold count cho Admin
router.get("/all-admin", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.description,
        p.price,
        p.image_url,
        p.uploader,
        p.status,
        p.created_at,
        p.category_id,
        c.category_name as category,
        COALESCE(COUNT(ti.id), 0) as sold
      FROM photos p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN transaction_items ti ON p.id = ti.photo_id
      GROUP BY p.id, p.title, p.description, p.price, p.image_url, p.uploader, 
               p.status, p.created_at, p.category_id, c.category_name
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách ảnh cho admin:", err);
    res
      .status(500)
      .json({ message: "Lỗi server khi lấy danh sách ảnh cho admin" });
  }
});

// 🖼️ Tải ảnh gốc (nếu đã mua)
router.get("/:id/download", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const purchased = await pool.query(
      `SELECT 1 FROM transaction_items WHERE user_id = $1 AND photo_id = $2 LIMIT 1`,
      [userId, id]
    );

    if (purchased.rowCount === 0) {
      return res.status(403).json({ message: "Bạn chưa mua ảnh này" });
    }

    const photoRes = await pool.query(
      `SELECT image_original_url FROM photos WHERE id = $1`,
      [id]
    );

    if (photoRes.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy ảnh" });
    }

    return res.json({ download_url: photoRes.rows[0].image_original_url });
  } catch (err) {
    console.error("❌ Lỗi download:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// PUT /:id/status – Chuyển đổi đã duyệt / chờ duyệt
router.put("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      "UPDATE photos SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy ảnh" });
    }

    res.json({ message: "Đã cập nhật trạng thái", photo: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Không thể cập nhật trạng thái" });
  }
});

// ========== EXISTING ROUTES ==========

// GET /admin – tất cả ảnh kèm tên danh mục (GIỮ NGUYÊN cho tương thích)
router.get("/admin", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        photos.id,
        photos.title,
        photos.uploader,
        photos.status,
        photos.category_id,
        categories.category_name AS category_name,
        photos.created_at
      FROM photos
      LEFT JOIN categories ON photos.category_id = categories.category_id
      ORDER BY photos.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Lỗi khi lấy danh sách ảnh cho admin:", err);
    res
      .status(500)
      .json({ message: "Lỗi server khi lấy danh sách ảnh cho admin" });
  }
});

// GET / – ảnh "Đã duyệt"
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT photos.*, categories.category_name AS category
      FROM photos
      LEFT JOIN categories ON photos.category_id = categories.category_id
      WHERE photos.status = 'Đã duyệt'
      ORDER BY photos.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Lỗi khi lấy danh sách ảnh:", err);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách ảnh" });
  }
});

// GET /:id – lấy ảnh theo id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT photos.*, categories.category_name AS category
       FROM photos
       LEFT JOIN categories ON photos.category_id = categories.category_id
       WHERE photos.id = $1`,
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy ảnh" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Lỗi khi lấy ảnh:", err);
    res.status(500).json({ message: "Lỗi server khi lấy ảnh" });
  }
});

// POST /upload – xử lý resize, watermark, upload
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có ảnh được upload" });
    }

    const localPath = req.file.path;

    // 1️⃣ Upload ảnh gốc lên Cloudinary
    const originalUpload = await cloudinary.uploader.upload(localPath, {
      folder: "photo_stock/original",
    });

    // 2️⃣ Xử lý watermark
    const img = await Jimp.read(localPath);

    if (img.getWidth() > 1280) {
      img.resize(1280, Jimp.AUTO);
    }
    img.quality(70);

    const watermarkPath = path.join(__dirname, "../assets/watermark.png");
    if (fs.existsSync(watermarkPath)) {
      const watermark = await Jimp.read(watermarkPath);
      watermark.resize(img.getWidth() / 4, Jimp.AUTO);

      const x = img.getWidth() - watermark.getWidth() - 10;
      const y = img.getHeight() - watermark.getHeight() - 10;

      img.composite(watermark, x, y, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.6,
      });
    }

    const watermarkedBuffer = await img.getBufferAsync(Jimp.MIME_JPEG);

    // 3️⃣ Upload ảnh watermark lên Cloudinary
    const watermarkUpload = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "photo_stock/watermark" }, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        })
        .end(watermarkedBuffer);
    });

    // 4️⃣ Xóa file tạm
    fs.unlinkSync(localPath);

    // 5️⃣ Lấy tên uploader và id từ UID
    const uid = req.body.uploader;
    const userRes = await pool.query(
      "SELECT id, full_name FROM users WHERE uid = $1",
      [uid]
    );
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: "Không tìm thấy user với UID này" });
    }
    
    const fullName = userRes.rows[0]?.full_name || "Ẩn danh";
    const uploaderId = userRes.rows[0].id;

    // 6️⃣ Lưu vào DB cả watermark + gốc, uploader = full_name
    const savedPhoto = await pool.query(
      `INSERT INTO photos 
        (title, description, uploader, uploader_id, image_url, image_original_url, category_id, price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
       [
          req.body.title || null,
          req.body.description || null,
          fullName,            // uploader (name)
          uploaderId,      // uploader_id
          watermarkUpload.secure_url,
          originalUpload.secure_url,
          req.body.category_id || null,
          req.body.price || 0,
          "Chờ duyệt",
       ]
    );
    

    res.json({ message: "Upload thành công", photo: savedPhoto.rows[0] });
  } catch (err) {
    console.error("❌ Lỗi upload:", err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "Lỗi server khi upload" });
  }
});

// PUT /:id/approve – duyệt ảnh
router.put("/:id/approve", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE photos SET status = 'Đã duyệt' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy ảnh để duyệt" });
    res.json({ message: "✅ Ảnh đã được duyệt", photo: result.rows[0] });
  } catch (err) {
    console.error("Lỗi khi duyệt ảnh:", err);
    res.status(500).json({ message: "Lỗi server khi duyệt ảnh" });
  }
});

// PUT /:id – cập nhật title/category
// PUT /:id – cập nhật ảnh (FIXED)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, category, description, price } = req.body;
  
  console.log("📝 Update request:", { id, title, category, description, price });
  
  try {
    // Bước 1: Lấy category_id từ category_name (case-insensitive)
    let categoryId = null;
    
    if (category) {
      const categoryResult = await pool.query(
        `SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER($1)`,
        [category]
      );
      
      if (categoryResult.rows.length > 0) {
        categoryId = categoryResult.rows[0].category_id;
      } else {
        console.error(`❌ Category "${category}" not found in database`);
        return res.status(400).json({ 
          message: `Danh mục "${category}" không tồn tại trong database. Vui lòng thêm danh mục này trước.` 
        });
      }
    }
    
    console.log("🔍 Found category_id:", categoryId);
    
    // Bước 2: Update photo với đầy đủ thông tin
    const result = await pool.query(
      `UPDATE photos 
       SET title = $1, 
           category_id = $2, 
           description = $3, 
           price = $4 
       WHERE id = $5 
       RETURNING *`,
      [title, categoryId, description, price, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy ảnh để cập nhật" });
    }
    
    console.log("✅ Updated successfully:", result.rows[0]);
    
    res.json({
      message: "Cập nhật thành công",
      photo: result.rows[0]
    });
    
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật ảnh:", err);
    res.status(500).json({ 
      message: "Lỗi server khi cập nhật ảnh",
      error: err.message 
    });
  }
});

// DELETE /:id – xóa ảnh
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM photos WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy ảnh để xóa" });
    res.json({ message: "Ảnh đã được xóa", photo: result.rows[0] });
  } catch (err) {
    console.error("Lỗi khi xóa ảnh:", err);
    res.status(500).json({ message: "Lỗi server khi xóa ảnh" });
  }
});

// ========== CART & STATUS ROUTES ==========

// 🆕 Kiểm tra trạng thái ảnh (đã mua / đã có trong giỏ hàng)
router.get("/check-status/:photoId/:userId", async (req, res) => {
  const { photoId, userId } = req.params;

  try {
    // Kiểm tra đã mua chưa - chỉ check trong transaction_items
    const purchased = await pool.query(
      `SELECT 1 FROM transaction_items 
       WHERE user_id = $1 AND photo_id = $2 
       LIMIT 1`,
      [userId, parseInt(photoId)]
    );

    // Kiểm tra đã có trong giỏ hàng chưa
    const inCart = await pool.query(
      `SELECT 1 FROM carts 
       WHERE user_id = $1 AND photo_id = $2 
       LIMIT 1`,
      [userId, parseInt(photoId)]
    );

    res.json({
      isPurchased: purchased.rowCount > 0,
      isInCart: inCart.rowCount > 0,
      canAddToCart: purchased.rowCount === 0 && inCart.rowCount === 0,
    });
  } catch (error) {
    console.error("❌ Lỗi check status:", error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 🛒 Thêm vào giỏ hàng (có kiểm tra đã mua)
router.post("/cart/add", async (req, res) => {
  const { userId, photoId, quantity = 1 } = req.body;

  console.log("📦 Request add to cart:", { userId, photoId, quantity });

  try {
    // 1. Kiểm tra đã mua chưa
    const purchased = await pool.query(
      `SELECT 1 FROM transaction_items 
       WHERE user_id = $1 AND photo_id = $2 
       LIMIT 1`,
      [userId, parseInt(photoId)]
    );

    if (purchased.rowCount > 0) {
      console.log("❌ Ảnh đã được mua trước đó");
      return res.status(400).json({
        error: "Ảnh này đã được mua trước đó!",
      });
    }

    // 2. Kiểm tra đã có trong giỏ hàng chưa
    const exists = await pool.query(
      `SELECT 1 FROM carts 
       WHERE user_id = $1 AND photo_id = $2 
       LIMIT 1`,
      [userId, parseInt(photoId)]
    );

    if (exists.rowCount > 0) {
      console.log("❌ Ảnh đã có trong giỏ hàng");
      return res.status(400).json({
        error: "Ảnh này đã có trong giỏ hàng!",
      });
    }

    // 3. Thêm vào giỏ hàng
    await pool.query(
      `INSERT INTO carts (user_id, photo_id, quantity)
       VALUES ($1, $2, $3)`,
      [userId, parseInt(photoId), quantity]
    );

    console.log("✅ Đã thêm vào giỏ hàng thành công!");
    res.json({ message: "Đã thêm vào giỏ hàng!" });
  } catch (error) {
    console.error("❌ Lỗi backend /cart/add:", error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
