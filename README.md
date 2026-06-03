# 🌿 الشلالة — alshallala
## نظام إدارة المياه الزراعية | مكتمل ومتكامل

---

## 📦 هيكل المشروع

```
alshallala-final/
├── frontend/           ← React App (واجهة المستخدم)
│   ├── src/
│   │   ├── api/index.js          ← كل الطلبات تمر هنا
│   │   ├── contexts/AuthContext  ← نظام الجلسات
│   │   ├── pages/
│   │   │   ├── LoginPage         ← صفحة الدخول
│   │   │   ├── FarmerDashboard   ← لوحة المزارع
│   │   │   └── AdminDashboard    ← لوحة الإدارة
│   │   └── components/
│   │       ├── farmer/FarmerNotes
│   │       └── admin/ (Farmers, Readings, Prices, Reports, Gallery, Settings)
│   └── .env                      ← REACT_APP_API_URL
├── backend/            ← Node.js + Express + MongoDB
│   ├── server.js                 ← نقطة الدخول
│   ├── config/
│   │   ├── database.js           ← MongoDB connection
│   │   └── firebase.js           ← Firebase Storage (للصور)
│   ├── src/
│   │   ├── models/               ← Mongoose Models
│   │   ├── controllers/          ← Business Logic
│   │   ├── routes/               ← API Routes
│   │   ├── middleware/           ← Auth + Rate Limiting
│   │   └── utils/jwt.js          ← JWT helpers
│   ├── scripts/init-admin.js     ← إعداد كلمة مرور الإدارة
│   └── .env                      ← الإعدادات السرية
├── nginx.conf          ← إعداد Nginx للـ Production
├── setup.sh            ← سكريبت إعداد الـ VPS تلقائياً
└── README.md
```

---

## 🚀 خطوات النشر على الـ VPS

### الخطوة 1 — رفع الملفات
```bash
scp -r alshallala-final/ user@YOUR_SERVER_IP:/var/www/alshallala/
```

### الخطوة 2 — تشغيل سكريبت الإعداد التلقائي
```bash
sudo bash /var/www/alshallala/alshallala-final/setup.sh yourdomain.com your@email.com
```
هذا يثبت Node.js، Nginx، PM2، HTTPS كل شيء دفعة واحدة.

### الخطوة 3 — إعداد ملف .env للـ Backend
```bash
nano /var/www/alshallala/backend/.env
```
عدّل هذه القيم:
```
JWT_SECRET=اكتب_نص_عشوائي_طويل_جداً_هنا
ADMIN_JWT_SECRET=اكتب_نص_عشوائي_آخر_مختلف
ALLOWED_ORIGINS=https://yourdomain.com
FIREBASE_PRIVATE_KEY="..."    ← من Firebase Console
FIREBASE_CLIENT_EMAIL=...
```

### الخطوة 4 — بناء الـ Frontend
```bash
cd /var/www/alshallala/frontend
# عدّل .env أولاً:
echo "REACT_APP_API_URL=https://api.yourdomain.com/api" > .env
npm install && npm run build
```

### الخطوة 5 — إعداد أول كلمة مرور للإدارة
```bash
cd /var/www/alshallala/backend
node scripts/init-admin.js كلمة_مرورك_الجديدة
```

### الخطوة 6 — السماح لـ MongoDB Atlas بـ IP السيرفر
في Atlas Console → Network Access → Add IP Address → أضف IP الـ VPS

---

## 🔒 منظومة الأمان

| الطبقة | التفاصيل |
|--------|----------|
| **MongoDB Atlas** | قاعدة بيانات `alshallala` منفصلة تماماً |
| **JWT للمزارع** | token مستقل، ينتهي بعد 8 ساعات |
| **JWT للإدارة** | مفتاح مختلف تماماً عن المزارع |
| **Rate Limiting** | 10 محاولات دخول كل 15 دقيقة |
| **Brute Force** | تأخير 1 ثانية عند كل فشل |
| **Helmet** | حماية HTTP headers |
| **CORS** | فقط نطاقك المسموح |
| **Data Isolation** | المزارع يرى بياناته فقط — مضمون من الـ Backend |
| **HTTPS** | Let's Encrypt مجاني |

---

## 🗄️ قاعدة البيانات — MongoDB (alshallala)

| Collection | المحتوى |
|------------|---------|
| `farmers` | بيانات المزارعين |
| `lands` | الأراضي |
| `readings` | قراءات عدادات المياه |
| `farmer_notes` | المفكرة الزراعية |
| `settings_prices` | الأسعار (عام + سنوي + خاص بأرض) |
| `settings_announcement` | الإعلانات |
| `settings_gallery` | معرض الصور |
| `settings_video` | رابط الفيديو |
| `settings_admin` | كلمة مرور الإدارة |

---

## 📱 التصميم

- **Mobile First** — يعمل على الهاتف والتابلت والكمبيوتر
- **RTL كامل** — عربي + عبري
- **Bottom Nav** على الهاتف للمزارع
- **Hamburger Menu** على الهاتف للإدارة
- خط Tajawal الاحترافي

---

## 🛠️ أوامر مفيدة

```bash
# حالة التطبيق
pm2 status

# مشاهدة logs
pm2 logs alshallala-api

# إعادة تشغيل بعد تعديل .env
pm2 restart alshallala-api

# اختبار الـ API
curl https://api.yourdomain.com/health

# تجديد HTTPS تلقائياً (كل 90 يوم)
certbot renew --dry-run
```
