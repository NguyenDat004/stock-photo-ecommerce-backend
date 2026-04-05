// Nạp biến môi trường từ file .env (ví dụ PORT, DB config, v.v.)
require("dotenv").config();
const app = require("./app"); 

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
