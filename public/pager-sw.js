// Service Worker بسيط لصفحة البيجر: يعرض الإشعارات ويفتح الصفحة عند الضغط
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (url && c.url.includes(url) && 'focus' in c) return c.focus();
    }
    if (url) return self.clients.openWindow(url);
  })());
});
