import { pushAPI } from '../api';

// ============================================================
//  push.js — تفعيل إشعارات الهاتف (Web Push) لهذا الجهاز
// ============================================================

// ✅ تحويل مفتاح VAPID العام من base64url إلى Uint8Array (شكل مطلوب من pushManager.subscribe)
const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
};

export const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const getPushPermission = () =>
  isPushSupported() ? Notification.permission : 'unsupported';

export const subscribeToPush = async () => {
  if (!isPushSupported()) throw new Error('هذا المتصفح لا يدعم إشعارات الهاتف');

  const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error('إعداد إشعارات الهاتف غير مكتمل (VAPID key مفقود)');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم منح إذن الإشعارات');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  await pushAPI.subscribe(subscription.toJSON());
  return subscription;
};