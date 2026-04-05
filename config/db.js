const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,                 // giới hạn connection
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// test kết nối 1 lần (đúng cách)
(async () => {
  try {
    console.log("✅ Kết nối Database thành công!");
  } catch (err) {
    console.error("❌ Lỗi kết nối Database:", err);
  }
})();

// bắt lỗi pool để tránh crash app
pool.on("error", (err) => {
  console.error("🔥 PostgreSQL Pool Error:", err);
  process.exit(1);
});

module.exports = pool;
