// Offline support. Precache the app; serve network-first so new deploys land, but never wait on a
// stalled connection (fall back to the cache after a short timeout) and never let an error page
// replace a good cached copy.
const CACHE = 'levelup-v6';
const ASSETS = [
  './index.html', './app.js', './body-data.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './fonts/archivo-var.woff2', './fonts/barlowc-500.woff2', './fonts/barlowc-600.woff2', './fonts/barlowc-700.woff2', './fonts/barlowc-800.woff2', './fonts/barlowc-800i.woff2',
  ...['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'].map((n, i) => `./ranks/rank-${i}-${n}.svg`),
  ...['procrastinator', 'hydra', 'golem', 'wraith', 'kraken'].map((n, i) => `./bosses/boss-${i}-${n}.svg`),
];
const INDEX = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))   // skip the HTTP cache
    .then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith('levelup-') || k.startsWith('lockin-')) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // the push-up counter's pose model (vendor/, ~19 MB) loads only when used: never copied into the cache
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/vendor/')) return;
  const nav = req.mode === 'navigate';
  const shell = nav && /\/(index\.html)?$/.test(url.pathname);   // the app's own page, with or without index.html
  const key = shell ? INDEX : req;
  const cached = () => caches.match(key, { ignoreSearch: true }).then(m => m || (nav ? caches.match(INDEX) : undefined));

  const net = fetch(req).then(r => ({ r, copy: r.ok ? r.clone() : null }));
  e.waitUntil(net.then(({ copy }) => copy && caches.open(CACHE).then(c => c.put(key, copy))).catch(() => {}));

  e.respondWith(new Promise(resolve => {
    let sent = false;
    const send = r => { if (r && !sent) { sent = true; resolve(r); } };
    const timer = setTimeout(() => cached().then(send), shell ? 3000 : 1500);
    net.then(({ r }) => { clearTimeout(timer); return r.ok ? r : cached().then(m => m || r); })
      .then(send, () => { clearTimeout(timer); return cached().then(m => send(m || Response.error())); });
  }));
});
