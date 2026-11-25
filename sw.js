const CACHE = "turntable-ios-i-10-1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=I.10.1",
  "./settings-help.css?v=I.10.1",
  "./settings-help-previews.css?v=I.10.1",
  "./screen-fit.css?v=I.10.1",
  "./preset-controls.css?v=I.10.1",
  "./desktop-layout.css?v=I.10.1",
  "./track-likes.css?v=I.10.1",
  "./viewport-resume.css?v=I.10.1",
  "./control-bar.css?v=I.10.1",
  "./now-playing-tour.css?v=I.10.1",
  "./refinements.css?v=I.10.1",
  "./bridge.js?v=I.10.1",
  "./settings-schema.js?v=I.10.1",
  "./app/core.js?v=I.10.1",
  "./app/artwork.js?v=I.10.1",
  "./app/lyrics.js?v=I.10.1",
  "./app/shell.js?v=I.10.1",
  "./app/queue.js?v=I.10.1",
  "./app/playlists.js?v=I.10.1",
  "./app/devices.js?v=I.10.1",
  "./app/player.js?v=I.10.1",
  "./app/controls.js?v=I.10.1",
  "./viewport-resume.js?v=I.10.1",
  "./track-likes.js?v=I.10.1",
  "./control-bar.js?v=I.10.1",
  "./now-playing-tour.js?v=I.10.1",
  "./settings-help.js?v=I.10.1",
  "./preset-controls.js?v=I.10.1",
  "./manifest.json",
  "./icons/turntable-remote-192.png",
  "./icons/apple-touch-icon.png"
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
