const CACHE_NAME = "famfinance-cache-v12";
const APP_SHELL = [
  "./",
  "./index.html?v=12",
  "./styles.css?v=12",
  "./app.js?v=12",
  "./manifest.json?v=12",
  "./icon-192.png?v=12",
  "./icon-512.png?v=12",
  "./apple-touch-icon.png?v=12",
  "./favicon-32.png?v=12"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(response => response || caches.match("./index.html?v=12") || caches.match("./index.html")))
  );
});
