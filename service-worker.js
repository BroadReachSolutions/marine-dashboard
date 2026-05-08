/* Marine Dashboard Service Worker
   Strategy: network-first for app files so updates deploy immediately.
   Falls back to cache only when offline.
   Bump CACHE_VERSION when you want to force all clients to update. */

const CACHE_VERSION = 'marine-v8';
const APP_SHELL = [
  '/marine-dashboard/',
  '/marine-dashboard/index.html',
  '/marine-dashboard/script.js',
  '/marine-dashboard/style.css',
  '/marine-dashboard/manifest.json',
  '/marine-dashboard/staugustine-sailing-logo.png',
];

/* Install: pre-cache app shell */
self.addEventListener('install', event => {
  self.skipWaiting(); /* activate immediately — no waiting for old tabs to close */
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
  );
});

/* Activate: delete old caches and claim all clients immediately */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) /* take control of all open tabs */
  );
});

/* Fetch: network-first for HTML/JS/CSS so updates are always live.
   Cache-first only for images and external tiles. */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Always go to network for API calls — never cache live data */
  if (
    url.hostname.includes('api.open-meteo.com') ||
    url.hostname.includes('tidesandcurrents.noaa.gov') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* App shell: network-first, fall back to cache */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        /* Update the cache with the fresh response */
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* Listen for a message from the page to skip waiting and reload */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
