const webpush = require('web-push');

let initialized = false;

// ============================================================
//  webpush.js — تهيئة مفاتيح VAPID لإرسال إشعارات Web Push
//  نفس نمط config/firebase.js — تهيئة كسولة (lazy) عند أول استخدام
// ============================================================
const initWebPush = () => {
  if (initialized) return;

  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('⚠️ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY غير مضبوطة — إشعارات الهاتف معطّلة');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
  console.log('✅ Web Push initialized');
};

const isWebPushReady = () => {
  initWebPush();
  return initialized;
};

module.exports = { webpush, initWebPush, isWebPushReady };