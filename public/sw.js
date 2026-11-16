// Service worker de Webby: solo para las notificaciones al móvil.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Webby';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/inicio' },
    tag: 'webby',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || '/inicio', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
