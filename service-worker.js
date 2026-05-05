const CACHE_NAME = 'marine-dashboard-v1';
const ASSETS = [
  '/marine-dashboard/',
  '/marine-dashboard/index.html',
  '/marine-dashboard/style.css',
  '/marine-dashboard/script.js',
  '/marine-dashboard/staugustine-sailing-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});