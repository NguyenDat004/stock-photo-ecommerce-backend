const admin = require('firebase-admin');
const serviceAccount = require('./firebaseServiceAccountKey.json');

// Tránh lỗi khi khởi tạo lại app nhiều lần
if (!admin.apps.length) {
  // Khởi tạo Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount), // Sử dụng service account key
  });
}

module.exports = admin;
