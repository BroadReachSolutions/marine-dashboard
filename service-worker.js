const CACHE_NAME = 'marine-dashboard-v2';

const ASSETS = [
  '/marine-dashboard/',
  '/marine-dashboard/index.html',
  '/marine-dashboard/style.css',
  '/marine-dashboard/script.js',
  '/marine-dashboard/staugustine-sailing-logo.png',
  '/marine-dashboard/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});