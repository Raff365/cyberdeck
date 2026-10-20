// LEVEL UP Family service worker: the app shell works offline (the page shows the last update it saved), the API is
// never cached (always fresh, and nothing private lands in a cache), and Web Push notifications are shown here.
const CACHE = 'luf-v2';
const SHELL = ['/', '/app.js', '/style.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png',
  '/fonts/archivo-var.woff2', '/fonts/barlowc-600.woff2', '/fonts/barlowc-700.woff2', '/fonts/barlowc-800.woff2'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('luf-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = req.mode === 'navigate' ? '/' : url.pathname;
  // network first (a new version lands at once), the cache when offline or the network stalls for 4 s
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = fetch(req.mode === 'navigate' ? '/' : req);
      const r = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
      if (r && r.ok && SHELL.includes(key)) cache.put(key, r.clone());
      return r;
    } catch (err) {
      const hit = await cache.match(key);
      if (hit) return hit;
      return fetch(req);
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'LEVEL UP Family', body: e.data ? e.data.text() : '' }; }
  const title = String(d.title || 'LEVEL UP Family').slice(0, 80);
  // iOS ends a subscription that gets a push without a notification shown: always show one
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 200), tag: d.tag || undefined, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/#alerts' }, timestamp: typeof d.at === 'number' ? d.at : Date.now(),
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#alerts', tab = url.split('#')[1] || 'alerts';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.postMessage({ type: 'open', tab }); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
