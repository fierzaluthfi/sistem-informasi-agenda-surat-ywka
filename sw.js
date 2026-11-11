// Service Worker untuk Sistem Informasi Agenda Surat (SIAS) SMAS YWKA Bandung
const CACHE_NAME = "sias-ywka-v3.9";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo-ywka.png",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png"
];

// 1. Install Event: Cache Core Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network First agar update kode & skrip Apps Script v3.9 langsung terbaca (cache hanya fallback offline)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Jangan cache request non-GET atau request ke Google Apps Script / Drive / Docs API
  if (
    req.method !== "GET" ||
    url.origin.includes("script.google.com") ||
    url.origin.includes("script.googleusercontent.com") ||
    url.origin.includes("drive.google.com") ||
    url.origin.includes("docs.google.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
