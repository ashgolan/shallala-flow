# 🌿 دليل نشر alshallala Backend على VPS

## المتطلبات
- Ubuntu 20.04+ / Debian 11+
- Node.js 18+
- Nginx
- PM2

---

## الخطوة 1: إعداد الـ VPS

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# تثبيت PM2
sudo npm install -g pm2

# تثبيت Nginx
sudo apt install -y nginx

# تثبيت Certbot للـ HTTPS
sudo apt install -y certbot python3-certbot-nginx
```

---

## الخطوة 2: رفع الملفات

```bash
# على جهازك المحلي:
scp -r alshallala-backend/ user@YOUR_SERVER_IP:/var/www/alshallala/

# على الـ VPS:
cd /var/www/alshallala/alshallala-backend
npm install --production
mkdir -p logs
```

---

## الخطوة 3: إعداد Firebase Service Account

1. اذهب إلى **Firebase Console → Project Settings → Service Accounts**
2. اضغط **Generate new private key**
3. ستنزل ملف JSON، افتحه وانسخ القيم إلى ملف `.env`

```bash
cp .env.example .env
nano .env
```

أهم الحقول في `.env`:
```
PORT=5000
NODE_ENV=production
JWT_SECRET=اكتب_هنا_نص_عشوائي_طويل_جداً
ADMIN_JWT_SECRET=اكتب_هنا_نص_عشوائي_آخر_مختلف
FIREBASE_PROJECT_ID=aluminum-company-394da
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@aluminum-company-394da.iam.gserviceaccount.com
ALLOWED_ORIGINS=https://yourdomain.com
```

---

## الخطوة 4: تشغيل بـ PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # لتشغيل تلقائي عند الإقلاع
```

---

## الخطوة 5: إعداد Nginx

```bash
sudo nano /etc/nginx/sites-available/alshallala
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 6M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/alshallala /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## الخطوة 6: HTTPS مجاني بـ Let's Encrypt

```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## الخطوة 7: Firestore Security Rules

في **Firebase Console → Firestore → Rules**، الصق هذا:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

في **Firebase Console → Storage → Rules**:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## الخطوة 8: إعداد الـ Frontend

في ملف `.env` في مجلد الـ React:
```
REACT_APP_API_URL=https://api.yourdomain.com/api
```

ثم أعد البناء:
```bash
npm run build
```

---

## الخطوة 9: أول دخول للإدارة

أضف يدوياً في **Firestore Console**:
- Collection: `settings`  
- Document: `admin`  
- Field: `password` = "كلمة_مرورك_الأولى"

بعدها يمكنك تغييرها من لوحة الإدارة في التطبيق.

---

## أوامر مفيدة

```bash
# حالة الـ server
pm2 status

# مشاهدة الـ logs
pm2 logs alshallala-api

# إعادة تشغيل
pm2 restart alshallala-api

# اختبار الـ health
curl https://api.yourdomain.com/health
```

---

## ملخص الأمان المطبق ✅

| الميزة | الوصف |
|--------|-------|
| JWT Tokens | كل طلب يحتاج token صالح |
| Rate Limiting | 10 محاولات دخول كل 15 دقيقة |
| Brute Force delay | تأخير 1 ثانية عند فشل الدخول |
| Helmet Headers | حماية HTTP headers |
| CORS | فقط نطاقك المسموح له |
| Firestore Rules | `allow: false` لكل شيء |
| Storage Rules | `allow: false` لكل شيء |
| Code separation | المزارع يرى بياناته فقط |
| Admin separation | JWT مختلف للمدير |
| Input validation | فحص كل المدخلات |
