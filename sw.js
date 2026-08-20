const CACHE = "turntable-ios-i9729-polling-optimization";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=I.9.7.29-polling-optimization", "./settings-help.css", "./settings-help-previews.css",
  "./screen-fit.css", "./preset-controls.css", "./desktop-layout.css?v=I.9.7.29-polling-optimization",
  "./bridge.js?v=I.9.7.29-polling-optimization", "./app.js?v=I.9.7.29-polling-optimization",
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