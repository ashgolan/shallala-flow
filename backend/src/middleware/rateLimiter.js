const rateLimit = require('express-rate-limit');

// ─── General API rate limit ────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 500, // رفعنا الحد لـ 500 طلب
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً، انتظر قليلاً' },
  skip: (req) => {
    // تجاوز للمطور المحلي
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
});

// ─── Login strict rate limit ───────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات دخول كثيرة جداً. انتظر 15 دقيقة.' },
  skipSuccessfulRequests: true,
});

// ─── Upload rate limit ─────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'تجاوزت حد الرفع المسموح' },
});

module.exports = { generalLimiter, loginLimiter, uploadLimiter };
