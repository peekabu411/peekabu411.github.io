const CACHE = "turntable-ios-i100-refine";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=I.9.8-song-likes", "./settings-help.css?v=I.10.0-refine", "./settings-help-previews.css?v=I.10.0-refine",
  "./screen-fit.css?v=I.10.0-refine", "./preset-controls.css?v=I.10.0-refine", "./desktop-layout.css?v=I.9.8-ipad-mini-layout",
  "./bridge.js?v=I.10.0-refine", "./app.js?v=I.10.0-refine", "./viewport-resume.js?v=I.9.8-viewport-resume", "./viewport-resume.css?v=I.9.8-viewport-resume", "./track-likes.js?v=I.9.8-song-likes", "./track-likes.css?v=I.9.8-song-likes-corners",
  "./settings-help.js?v=I.9.9-control-bar", "./preset-controls.js?v=I.9.9-control-bar", "./control-bar.js?v=I.10.0-divider-seek", "./control-bar.css?v=I.10.0-divider-seek", "./now-playing-tour.js?v=I.9.9-tour-tabs", "./now-playing-tour.css?v=I.9.9-tour-tabs", "./refinements.css?v=I.10.0-refine", "./manifest.json",
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
