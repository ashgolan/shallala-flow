const PushSubscription = require('../models/PushSubscription');
const { isWebPushReady } = require('../../config/webpush');

// ─── تسجيل/تحديث اشتراك إشعارات لهذا الجهاز ────────────────────
const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'بيانات الاشتراك غير مكتملة' });
    }

    const role   = req.adminRole; // 'admin' أو 'viewer' — من requireAdmin middleware
    const userId = role === 'admin' ? (req.adminId || null) : (req.viewerId || null);

    // ✅ upsert بالـ endpoint — نفس الجهاز يحدّث اشتراكه بدل ما يتكرر
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { role, userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json({ success: true, ready: isWebPushReady() });
  } catch (err) {
    console.error('push subscribe:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── إلغاء اشتراك (مثلاً عند تسجيل الخروج) ──────────────────────
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint مطلوب' });
    await PushSubscription.deleteOne({ endpoint });
    return res.json({ success: true });
  } catch (err) {
    console.error('push unsubscribe:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = { subscribe, unsubscribe };