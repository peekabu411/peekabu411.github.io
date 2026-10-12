const CACHE = "turntable-ios-i98-security";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=I.9.8-security", "./settings-help.css", "./settings-help-previews.css",
  "./screen-fit.css", "./preset-controls.css", "./desktop-layout.css?v=I.9.8-ipad-mini-layout",
  "./bridge.js?v=I.9.8-security", "./app.js?v=I.9.8-security",
  "./settings-help.js", "./preset-controls.js", "./manifest.webmanifest", "./manifest.json",
  "./icons/turntable-remote-192.png", "./icons/apple-touch-icon.png"
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
const sensitiveRequest = request => {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/") || ["code", "state", "error", "error_description"].some(key => url.searchParams.has(key));
};
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(async key => {
  // Other apps can share this GitHub Pages origin; only manage Turntable caches.
  if (!key.startsWith("turntable-ios-")) return;
  if (key !== CACHE) { await caches.delete(key); return; }
  const cache = await caches.open(key);
  await Promise.all((await cache.keys()).filter(sensitiveRequest).map(request => cache.delete(request)));
}))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (sensitiveRequest(event.request)) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !response.redirected && !sensitiveRequest({ url: response.url || event.request.url })) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
