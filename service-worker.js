const CACHE_NAME = 'qr-price-pos-v3';
const APP_ASSETS = [
  './',
  './index.html',
  './app.js',
  './qrgen.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.legacy.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_ASSETS);
    for (const url of EXTERNAL_ASSETS) {
      try { await cache.add(url, { mode: 'cors' }); } catch (e) { /* ignore; will fetch later online */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      if (response && response.status === 200) cache.put(event.request, response.clone());
      return response;
    } catch (err) {
      const fallback = await caches.match('./index.html');
      if (event.request.mode === 'navigate' && fallback) return fallback;
      throw err;
    }
  })());
});
