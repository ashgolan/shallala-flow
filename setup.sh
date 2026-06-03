#!/bin/bash
# ============================================================
#  setup.sh — إعداد الـ VPS بأمر واحد
#  استخدام: sudo bash setup.sh yourdomain.com your@email.com
# ============================================================

set -e  # إيقاف عند أي خطأ

DOMAIN=${1:-"yourdomain.com"}
EMAIL=${2:-"admin@yourdomain.com"}
APP_DIR="/var/www/alshallala"

echo ""
echo "🌿 ============================="
echo "   إعداد الشلالة على الـ VPS"
echo "   النطاق: $DOMAIN"
echo "🌿 ============================="
echo ""

# ── 1. تحديث النظام ──────────────────────────────────────
echo "📦 [1/8] تحديث النظام..."
apt update -qq && apt upgrade -y -qq

# ── 2. تثبيت Node.js 18 ──────────────────────────────────
echo "⚙️  [2/8] تثبيت Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >/dev/null 2>&1
apt install -y -qq nodejs

# ── 3. تثبيت PM2 و Nginx ─────────────────────────────────
echo "🔧 [3/8] تثبيت PM2 و Nginx..."
npm install -g pm2 -q
apt install -y -qq nginx certbot python3-certbot-nginx

# ── 4. إنشاء مجلد التطبيق ────────────────────────────────
echo "📁 [4/8] إعداد مجلدات التطبيق..."
mkdir -p $APP_DIR/{backend,frontend/build}
mkdir -p $APP_DIR/backend/logs

# ── 5. تثبيت dependencies الـ Backend ─────────────────────
echo "📦 [5/8] تثبيت مكتبات Backend..."
cd $APP_DIR/backend
npm install --production -q

# ── 6. إعداد Nginx ───────────────────────────────────────
echo "🌐 [6/8] إعداد Nginx..."
cat > /etc/nginx/sites-available/alshallala << NGINXEOF
server {
    listen 80;
    server_name api.$DOMAIN;
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 6M;
        proxy_read_timeout 60s;
    }
}
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $APP_DIR/frontend/build;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /static/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location = /index.html { add_header Cache-Control "no-cache"; }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/alshallala /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "   ✅ Nginx جاهز"

# ── 7. HTTPS ──────────────────────────────────────────────
echo "🔒 [7/8] إعداد HTTPS (Let's Encrypt)..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN -d api.$DOMAIN \
  --non-interactive --agree-tos --email $EMAIL -q || echo "⚠️  HTTPS: تأكد من DNS أولاً"

# ── 8. إطلاق PM2 ──────────────────────────────────────────
echo "🚀 [8/8] تشغيل التطبيق بـ PM2..."
cd $APP_DIR/backend
pm2 delete alshallala-api 2>/dev/null || true
pm2 start server.js --name alshallala-api --env production
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "✅ ============================="
echo "   التطبيق يعمل الآن!"
echo ""
echo "   🌐 الموقع:    https://$DOMAIN"
echo "   📡 الـ API:   https://api.$DOMAIN/health"
echo ""
echo "   ⚠️  خطوة مهمة: إعداد كلمة مرور الإدارة"
echo "   node $APP_DIR/backend/scripts/init-admin.js كلمة_المرورك"
echo "============================="
