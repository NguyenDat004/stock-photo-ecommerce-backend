// Nạp biến môi trường từ file .env (ví dụ PORT, DB config, v.v.)
require("dotenv").config();

// Import các thư viện cần thiết
const express = require("express");
const cors = require("cors");
const app = express();

// Kết nối PostgreSQL và Firebase
const pool = require("./config/db");
const admin = require("./config/firebase"); // Firebase Admin SDK

// Middleware xử lý chung
app.use(cors());
app.use(express.json());

// ✅ Cho phép truy cập ảnh avatar, ảnh upload từ thư mục "uploads"
app.use("/uploads", express.static("uploads"));

// ----------------- Định nghĩa các route -----------------

// Admin - Thống kê Dashboard
const adminStatsRouter = require("./routes/admin/AdminStats");
app.use("/api/admin", adminStatsRouter);


// Auth - Đăng ký, đăng nhập, xác thực người dùng
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// Photo - Xử lý ảnh (upload, lấy ảnh, v.v.)
const photoRoutes = require("./routes/photos");
app.use("/api/photos", photoRoutes);

// Cart - Giỏ hàng
const cartRouter = require("./routes/cart");
app.use("/api/cart", cartRouter);

// Users - Thông tin người dùng
const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

// Categories - Danh mục ảnh
const categoryRoutes = require("./routes/categories");
app.use("/api/categories", categoryRoutes);

// Checkout - Thanh toán
// const checkoutRoutes = require("./routes/checkout");
// app.use("/api/checkout", checkoutRoutes);

// VNPAY - Thanh toán qua VNPAY
const vnpayRoutes = require("./routes/vnpay");
app.use("/api/vnpay", vnpayRoutes);

// Wallets - Ví điện tử người dùng
const walletRoutes = require("./routes/wallet");
app.use("/api/wallet", walletRoutes);

// Withdrawals - Rút tiền cho người bán
const withdrawRoutes = require("./routes/withdraw");
app.use("/api/withdraw", withdrawRoutes);



// Transactions - Lịch sử giao dịch
const transactionRoutes = require("./routes/transactions");
app.use("/api/transactions", transactionRoutes);

// Downloads - Kho ảnh đã mua
const downloadRoutes = require("./routes/downloads");
app.use("/api/downloads", downloadRoutes);

// Reviews - Đánh giá ảnh
const reviewRoutes = require("./routes/reviews");
app.use("/api/reviews", reviewRoutes);

// Route test server hoạt động
app.get("/", (req, res) => {
  res.send("🔥 Backend đang hoạt động!");
});

// ----------------- Khởi động Server -----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 Server đang chạy trên port ${PORT}    ║
║  📍 http://localhost:${PORT}              ║
╚════════════════════════════════════════╝
  `);
});
