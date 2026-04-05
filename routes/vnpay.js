const express = require("express");
const router = express.Router();
const moment = require("moment");
const qs = require("qs");
const crypto = require("crypto");
const pool = require("../config/db");
const authMiddleware = require("../middlewares/authMiddleware");

// ============================================================================
// 
// ============================================================================
function getIpAddress(req) {
  let ip =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "127.0.0.1";

  if (ip.includes("::ffff:")) ip = ip.replace("::ffff:", "");
  if (ip === "::1") ip = "127.0.0.1";

  return ip;
}

// ============================================================================
// TẠO URL THANH TOÁN VNPay
// ============================================================================
router.post("/create-payment", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { selectedPhotoIds } = req.body; // Nhận danh sách photo_id đã chọn từ frontend

    const ipAddr = getIpAddress(req);
    const date = moment().format("YYYYMMDDHHmmss");

    const tmnCode = process.env.VNP_TMN_CODE;
    const secretKey = process.env.VNP_HASH_SECRET;
    const vnpUrl = process.env.VNP_URL;
    const returnUrl = process.env.VNP_RETURN_URL;

    // Lấy giỏ hàng - CHỈ LẤY ITEMS ĐÃ CHỌN
    let cartQuery;
    let queryParams;

    if (selectedPhotoIds && selectedPhotoIds.length > 0) {
      // Nếu có chọn cụ thể, chỉ lấy những items đó
      cartQuery = `
        SELECT carts.photo_id, photos.price
        FROM carts
        JOIN photos ON carts.photo_id = photos.id
        WHERE carts.user_id = $1 AND carts.photo_id = ANY($2)
      `;
      queryParams = [userId, selectedPhotoIds];
    } else {
      // Nếu không, lấy toàn bộ giỏ hàng
      cartQuery = `
        SELECT carts.photo_id, photos.price
        FROM carts
        JOIN photos ON carts.photo_id = photos.id
        WHERE carts.user_id = $1
      `;
      queryParams = [userId];
    }

    const cart = await pool.query(cartQuery, queryParams);

    if (cart.rows.length === 0)
      return res.status(400).json({ message: "Giỏ hàng rỗng" });

    const totalAmount = cart.rows.reduce(
      (sum, item) => sum + Number(item.price),
      0
    );

    // Encode userId và selectedPhotoIds → để biết thanh toán những items nào
    const orderData = {
      userId: userId,
      selectedPhotoIds: cart.rows.map((item) => item.photo_id),
    };
    const orderInfo = Buffer.from(JSON.stringify(orderData)).toString("base64");

    let vnp_Params = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: date,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: "billpayment",
      vnp_Amount: totalAmount * 100,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: date,
    };

    // Sort theo thứ tự a-z
    vnp_Params = sortObject(vnp_Params);

    // FIX: Đổi encode: false → encode: true
    const signData = qs.stringify(vnp_Params, { encode: true });
    const hmac = crypto.createHmac("sha512", secretKey);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    vnp_Params["vnp_SecureHash"] = signed;

    // FIX: Đổi encode: false → encode: true
    const paymentUrl =
      vnpUrl + "?" + qs.stringify(vnp_Params, { encode: true });

    // Debug log
    console.log("=== VNPay Create Payment Debug ===");
    console.log("Total Amount:", totalAmount);
    console.log("User ID:", userId);
    console.log("Payment URL created successfully");

    res.json({ paymentUrl });
  } catch (err) {
    console.error("Error creating payment:", err);
    res.status(500).json({ message: "Lỗi tạo thanh toán" });
  }
});

// ============================================================================
// VNPay RETURN URL
// ============================================================================
router.get("/return", async (req, res) => {
  console.log("\n========================================");
  console.log("🔔 VNPay Return Callback");
  console.log("========================================");
  console.log("📦 Query params:", req.query);

  try {
    // BƯỚC 1: Verify signature
    console.log("\n--- BƯỚC 1: Verify Signature ---");
    let vnp_Params = { ...req.query };
    const secureHash = vnp_Params["vnp_SecureHash"];

    delete vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHashType"];

    vnp_Params = sortObject(vnp_Params);

    const secretKey = process.env.VNP_HASH_SECRET;
    const signData = qs.stringify(vnp_Params, { encode: true });

    const signed = crypto
      .createHmac("sha512", secretKey)
      .update(Buffer.from(signData, "utf-8"))
      .digest("hex");

    console.log("🔐 Expected Hash:", signed);
    console.log("🔐 Received Hash:", secureHash);

    if (secureHash !== signed) {
      console.error("❌ SIGNATURE INVALID!");
      return res.json({
        success: false,
        error: "invalid_signature",
      });
    }
    console.log("✅ Signature valid");

    // BƯỚC 2: Check response code
    console.log("\n--- BƯỚC 2: Check Response Code ---");
    console.log("📋 Response Code:", vnp_Params["vnp_ResponseCode"]);

    if (vnp_Params["vnp_ResponseCode"] !== "00") {
      console.error(
        "❌ PAYMENT FAILED - Response code:",
        vnp_Params["vnp_ResponseCode"]
      );
      return res.redirect(
        `http://localhost:3000/payment-failed?code=${vnp_Params["vnp_ResponseCode"]}`
      );
    }
    console.log("✅ Payment approved by VNPay");

    // BƯỚC 3: Decode userId và selectedPhotoIds
    console.log("\n--- BƯỚC 3: Decode Order Info ---");
    console.log("📝 Base64 OrderInfo:", vnp_Params["vnp_OrderInfo"]);

    const orderData = JSON.parse(
      Buffer.from(vnp_Params["vnp_OrderInfo"], "base64").toString()
    );
    const userId = orderData.userId;
    const selectedPhotoIds = orderData.selectedPhotoIds;

    console.log("👤 User ID:", userId);
    console.log("🎯 Selected Photo IDs:", selectedPhotoIds);

    // BƯỚC 3.5: Kiểm tra user tồn tại
    console.log("\n--- BƯỚC 3.5: Check User Exists ---");
    const userCheck = await pool.query(`SELECT uid FROM users WHERE uid = $1`, [
      userId,
    ]);

    if (userCheck.rows.length === 0) {
      console.error("❌ USER NOT FOUND in database:", userId);
      return res.redirect(
        "http://localhost:3000/payment-failed?error=user_not_found"
      );
    }
    console.log("✅ User exists in database");

    // BƯỚC 4: Lấy giỏ hàng - CHỈ LẤY ITEMS ĐÃ CHỌN
    console.log("\n--- BƯỚC 4: Get Cart ---");
    const cart = await pool.query(
      `SELECT carts.photo_id, photos.price
       FROM carts
       JOIN photos ON carts.photo_id = photos.id
       WHERE carts.user_id = $1 AND carts.photo_id = ANY($2)`,
      [userId, selectedPhotoIds]
    );

    console.log("🛒 Cart items found:", cart.rows.length);

    if (cart.rows.length === 0) {
      console.error("❌ CART IS EMPTY for user:", userId);
      return res.redirect(
        "http://localhost:3000/payment-failed?error=empty_cart"
      );
    }

    console.log("📦 Cart items:", cart.rows);

    // BƯỚC 5: Tính tổng tiền
    console.log("\n--- BƯỚC 5: Calculate Total ---");
    const totalAmount = cart.rows.reduce(
      (sum, item) => sum + Number(item.price),
      0
    );
    const totalItems = cart.rows.length;
    console.log("💰 Total Amount:", totalAmount, "VND");
    console.log("📦 Total Items:", totalItems);

    // BƯỚC 6: Tạo transaction
    console.log("\n--- BƯỚC 6: Create Transaction ---");
    const tran = await pool.query(
      `INSERT INTO transactions (user_id, total_price, status, total_items)
       VALUES ($1, $2, 'success', $3)
       RETURNING transaction_id`,
      [userId, totalAmount, totalItems]
    );

    const transactionId = tran.rows[0].transaction_id;
    console.log("💳 Transaction created with ID:", transactionId);

    // BƯỚC 7: Thêm transaction items
    console.log("\n--- BƯỚC 7: Add Transaction Items ---");
    for (let item of cart.rows) {
      const photoData = await pool.query(
        `SELECT price, uploader_id 
         FROM photos 
         WHERE id = $1`,
        [item.photo_id]
      );

      const price = Number(photoData.rows[0].price);
      const sellerId = photoData.rows[0].uploader_id;
      const sellerEarn = price * 0.8;

      await pool.query(
        `INSERT INTO transaction_items (transaction_id, photo_id, price, user_id, seller_id, seller_earn)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [transactionId, item.photo_id, price, userId, sellerId, sellerEarn]
      );

      console.log(
        `✓ Saved item → photo: ${item.photo_id}, seller: ${sellerId}, earn: ${sellerEarn}`
      );
    }
    // ============================================================================
    // BƯỚC 7.5 — CỘNG TIỀN CHO SELLER + LƯU WALLET + WALLET_TRANSACTIONS
    // ============================================================================
    console.log("\n--- BƯỚC 7.5: Update Seller Wallets ---");

    const itemsResult = await pool.query(
      `SELECT ti.photo_id, ti.price, ti.seller_id, ti.seller_earn
      FROM transaction_items ti
      WHERE ti.transaction_id = $1`,
      [transactionId]
    );

    for (const item of itemsResult.rows) {
      const sellerId = item.seller_id;
      const sellerEarn = Number(item.seller_earn);

      console.log(`➡ Cộng tiền cho seller ${sellerId}: +${sellerEarn}`);

      // 1️⃣ Tạo ví nếu chưa có
      const walletCheck = await pool.query(
        `SELECT user_id FROM wallets WHERE user_id = $1`,
        [sellerId]
      );

      if (walletCheck.rows.length === 0) {
        console.log(`Ví của seller ${sellerId} chưa tồn tại → tạo mới`);
        await pool.query(
          `INSERT INTO wallets (user_id, balance, total_earned) VALUES ($1, 0, 0)`,
          [sellerId]
        );
      }

      // 2️⃣ Cộng tiền vào ví
      await pool.query(
        `UPDATE wallets 
        SET balance = balance + $1,
        total_earned = total_earned + $1,
        updated_at = NOW()
        WHERE user_id = $2`,
        [sellerEarn, sellerId]
      );

      // 3️⃣ Tạo record lịch sử giao dịch ví
      await pool.query(
        `INSERT INTO wallet_transactions 
        (user_id, amount, transaction_type, description)
        VALUES ($1, $2, 'earn', $3)`,
        [sellerId, sellerEarn, `Thu nhập từ bán ảnh ID ${item.photo_id}`]
      );

      console.log(`✓ Ghi lịch sử ví cho seller ${sellerId}`);
    }

    console.log("💰 Ví của seller đã được cập nhật");

    // BƯỚC 8: Xóa giỏ hàng - CHỈ XÓA ITEMS ĐÃ THANH TOÁN
    console.log("\n--- BƯỚC 8: Clear Cart ---");
    await pool.query(
      "DELETE FROM carts WHERE user_id = $1 AND photo_id = ANY($2)",
      [userId, selectedPhotoIds]
    );
    console.log("🗑️ Cart cleared (only paid items)");

    console.log("\n========================================");
    console.log("✅ PAYMENT PROCESSING COMPLETED!");
    console.log("🎉 Redirecting to PaymentSuccess page...");
    console.log("========================================\n");

    // ✅ FIXED: Redirect với query params từ VNPay
    const redirectUrl = `http://localhost:3000/payment-success?vnp_ResponseCode=${vnp_Params["vnp_ResponseCode"]}&vnp_Amount=${vnp_Params["vnp_Amount"]}&vnp_TxnRef=${vnp_Params["vnp_TxnRef"]}&transaction_id=${transactionId}`;

    console.log("🔗 Redirect URL:", redirectUrl);
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("\n========================================");
    console.error("❌ ERROR PROCESSING PAYMENT");
    console.error("========================================");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    console.error("========================================\n");

    return res.redirect(
      "http://localhost:3000/payment-failed?error=processing_error"
    );
  }
});

// ============================================================================
// Helper function: Sort object keys alphabetically
// ============================================================================
function sortObject(obj) {
  let sorted = {};
  let keys = Object.keys(obj).sort();
  keys.forEach((key) => (sorted[key] = obj[key]));
  return sorted;
}

module.exports = router;
