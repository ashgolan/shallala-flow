// ─── حماية من محاولات الدخول المتكررة ────────────────────────
// يحفظ المحاولات في الذاكرة (كافٍ للاستخدام الداخلي)

const attempts = new Map(); // ip -> { count, lockedUntil, lastAttempt }

const MAX_ATTEMPTS  = 5;           // أقصى محاولات قبل القفل
const LOCK_DURATION = 15 * 60 * 1000; // 15 دقيقة قفل
const WINDOW        = 10 * 60 * 1000; // نافذة 10 دقائق للعد

const getIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.connection?.remoteAddress
    || req.ip
    || 'unknown';
};

// Middleware: تحقق قبل محاولة الدخول
const checkLoginAttempts = (req, res, next) => {
  const ip   = getIp(req);
  const now  = Date.now();
  const data = attempts.get(ip);

  if (data) {
    // هل الحساب مقفل؟
    if (data.lockedUntil && now < data.lockedUntil) {
      const remaining = Math.ceil((data.lockedUntil - now) / 60000);
      console.log(`🔒 Blocked login attempt from ${ip} — locked for ${remaining} more minutes`);
      return res.status(429).json({
        error: `تم قفل الدخول بسبب محاولات متكررة. انتظر ${remaining} دقيقة.`,
        locked: true,
        remainingMinutes: remaining,
      });
    }

    // إعادة ضبط العداد إذا انتهت النافذة الزمنية
    if (now - data.lastAttempt > WINDOW) {
      attempts.delete(ip);
    }
  }

  next();
};

// تسجيل محاولة فاشلة
const recordFailedAttempt = (req) => {
  const ip   = getIp(req);
  const now  = Date.now();
  const data = attempts.get(ip) || { count: 0, lockedUntil: null, lastAttempt: now };

  data.count++;
  data.lastAttempt = now;

  if (data.count >= MAX_ATTEMPTS) {
    data.lockedUntil = now + LOCK_DURATION;
    console.log(`🚨 IP ${ip} locked after ${data.count} failed attempts — until ${new Date(data.lockedUntil).toLocaleTimeString()}`);
  } else {
    console.log(`⚠️  Failed login from ${ip} — attempt ${data.count}/${MAX_ATTEMPTS}`);
  }

  attempts.set(ip, data);
  return MAX_ATTEMPTS - data.count;
};

// تسجيل نجاح الدخول — إعادة ضبط العداد
const recordSuccess = (req) => {
  const ip = getIp(req);
  attempts.delete(ip);
  console.log(`✅ Successful login from ${ip}`);
};

// تنظيف الذاكرة كل ساعة
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of attempts.entries()) {
    if (now - data.lastAttempt > LOCK_DURATION) {
      attempts.delete(ip);
    }
  }
}, 60 * 60 * 1000);

module.exports = { checkLoginAttempts, recordFailedAttempt, recordSuccess };
