/* ============================================================
 *  sw.js — Service Worker لإشعارات الهاتف (Web Push)
 *  ملف ثابت بمجلد public/ — ما يمر بمعالجة webpack، فما يحتاج
 *  eject ولا أي تعديل على react-scripts.
 * ============================================================ */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── استقبال إشعار Push من الباك إند وعرضه ─────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'الشلالة', body: 'لديك تحديث جديد', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // نص عادي بدل JSON — نستخدمه كـ body
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'shallala-task',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || '/' },
    })
  );
});

// ── الضغط على الإشعار → فتح/تركيز نافذة التطبيق ────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate?.(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});