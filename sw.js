// Offline support: precache the app shell, then network-first so updates land, cache as fallback.
const CACHE = 'levelup-v2';
const ASSETS = [
  './', './index.html', './app.js', './body-data.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './fonts/archivo-var.woff2', './fonts/barlowc-500.woff2', './fonts/barlowc-600.woff2', './fonts/barlowc-700.woff2', './fonts/barlowc-800.woff2', './fonts/barlowc-800i.woff2',
  ...['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'].map((n, i) => `./ranks/rank-${i}-${n}.svg`),
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
