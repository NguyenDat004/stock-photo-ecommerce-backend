# 📸 Stock Photo Ecommerce Backend API

Backend RESTful API for an **Online Stock Photo Marketplace**  
Built with **Node.js, Express, PostgreSQL, Firebase Authentication & Cloudinary**

This system allows users to upload, buy, sell and download stock photos.

---

## 🚀 Features

- 🔐 Firebase Authentication (Register / Login)
- ☁️ Upload & store images with Cloudinary
- 🛒 Shopping Cart & Checkout
- 💳 VNPay Payment Integration
- 💰 Wallet & Withdrawal system for sellers
- 📊 Admin Dashboard & Statistics
- ⭐ Reviews & Ratings
- 📥 Purchase History & Downloads

---

## 🛠 Tech Stack

**Backend**
- Node.js
- Express.js
- PostgreSQL
- Firebase Admin SDK
- Cloudinary
- VNPay Payment Gateway

**Architecture**
- RESTful API
- MVC Pattern
- Environment Variables (.env)

---

## ⚙️ Installation & Setup

### 1️⃣ Clone repository
git clone https://github.com/NguyenDat004/stock-photo-ecommerce-backend.git
cd stock-photo-ecommerce-backend

### 2️⃣ Install dependencies
npm install

### 3️⃣ Create `.env` file
Create a `.env` file in the root folder and add:
    PORT=5000
    DATABASE_URL=your_postgres_url
    FIREBASE_PROJECT_ID=your_project_id
    CLOUDINARY_CLOUD_NAME=xxx
    CLOUDINARY_API_KEY=xxx
    CLOUDINARY_API_SECRET=xxx

### 4️⃣ Run development server
npm run dev
Server will run at:
    http://localhost:5000
    
---

## 📡 API Base URL
http://localhost:5000/api

---

## 📂 Project Structure
config/        → Database & Firebase config  
controllers/   → Business logic  
routes/        → API endpoints  
middlewares/   → Authentication middleware  
utils/         → Helper functions  
uploads/       → Local uploads (ignored by git)  
app.js         → Express app setup  
index.js       → Server entry point

---

## 👨‍💻 Author

**Nguyen Dat**  
Fullstack Developer (Personal Project)