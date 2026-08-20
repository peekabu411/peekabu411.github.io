const CACHE = "turntable-ios-i9728-rate-limit-30";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=I.9.7.28-rate-limit-30", "./settings-help.css", "./settings-help-previews.css",
  "./screen-fit.css", "./preset-controls.css", "./desktop-layout.css?v=I.9.7.28-rate-limit-30",
  "./bridge.js?v=I.9.7.28-rate-limit-30", "./app.js?v=I.9.7.28-rate-limit-30",
  "./settings-help.js", "./preset-controls.js", "./manifest.webmanifest", "./manifest.json",
  "./icons/turntable-remote-192.png", "./icons/apple-touch-icon.png"
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});