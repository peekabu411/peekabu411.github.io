// Volume auto-hide check: when the playing Spotify device reports supports_volume: false (the
// iPhone or iPad itself), the volume control tucks away with no reveal arrow, and it comes back
// when playback moves to a device that takes volume changes. Spotify is answered by fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const target = path.resolve(root, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(target, (error, data) => {
    res.writeHead(error ? 404 : 200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
    res.end(error ? "Not found" : data);
  });
});
const track = { type: "track", id: "4iV5W9uYEdYUVa79Axb7Rh", uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh", name: "Volume Song", duration_ms: 240000, artists: [{ name: "Test Artist" }], album: { name: "Test Album", images: [{ url: "https://i.scdn.co/image/test-art" }] }, external_urls: { spotify: "https://open.spotify.com/track/x" } };
const PHONE = { id: "p", name: "iPhone", type: "Smartphone", is_active: true, supports_volume: false, volume_percent: 100 };
const SPEAKER = { id: "s", name: "Living room", type: "Speaker", is_active: true, supports_volume: true, volume_percent: 40 };
let device = PHONE;
const volumeCalls = [];
async function fixtures(context) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { "Access-Control-Allow-Origin": "*" };
    if (url.hostname === "accounts.spotify.com") return route.fulfill({ json: { access_token: "a", refresh_token: "r", expires_in: 3600 }, headers });
    if (url.hostname === "api.spotify.com") {
      if (url.pathname.endsWith("/volume")) volumeCalls.push(url.search);
      if (request.method() !== "GET") return route.fulfill({ status: 204, headers });
      const playback = { item: track, is_playing: true, progress_ms: 60000, device, context: null, shuffle_state: false, repeat_state: "off", actions: { disallows: {} } };
      const json = url.pathname === "/v1/me/library/contains" ? [false] : url.pathname.endsWith("/devices") ? { devices: [device] } : url.pathname.endsWith("/queue") ? { queue: [] } : url.pathname.endsWith("/playlists") ? { items: [] } : url.pathname === "/v1/me" ? { id: "u" } : playback;
      return route.fulfill({ json, headers });
    }
    if (url.hostname === "i.scdn.co") return route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "icons/turntable-remote-192.png")), headers });
    return route.fulfill({ contentType: "text/css", body: "", headers });
  });
}
const railState = page => page.evaluate(() => {
  const rail = document.querySelector(".dial-rail"), reveal = document.getElementById("side-control-reveal"), remote = document.getElementById("remote");
  return {
    unavailable: remote.classList.contains("volume-unavailable"),
    tucked: remote.classList.contains("side-controls-hidden"),
    railVisible: getComputedStyle(rail).visibility !== "hidden",
    revealShown: getComputedStyle(reveal).display !== "none" && getComputedStyle(reveal).visibility !== "hidden"
  };
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 844, height: 390 }, { width: 1180, height: 820 }]) {
      device = PHONE;
      const context = await browser.newContext({ viewport, hasTouch: true });
      context.setDefaultTimeout(10000);
      await fixtures(context);
      await context.addInitScript(() => {
        if (localStorage.getItem("turntable-session")) return;
        localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "t", access_token: "a", refresh_token: "r", expires_at: Date.now() + 600000, scope: "user-library-read user-library-modify" }));
        localStorage.setItem("turntable-session", "github-pages");
        localStorage.setItem("turntable-now-playing-guide-v2", "completed");
        sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Volume Song");
      await page.waitForTimeout(600);
      const label = `${viewport.width}x${viewport.height}`;

      // Playing on the phone itself: the control is tucked away and cannot be brought back.
      let state = await railState(page);
      assert.deepEqual(state, { unavailable: true, tucked: true, railVisible: false, revealShown: false }, label + " phone playback");
      await page.evaluate(() => setSideControlsHidden(false));
      assert.equal((await railState(page)).tucked, true, label + " cannot reveal while the device keeps its own volume");

      // Playback moves to a speaker: the control comes back on its own.
      device = SPEAKER;
      await page.evaluate(() => refresh(true));
      await page.waitForFunction(() => !document.getElementById("remote").classList.contains("volume-unavailable"));
      await page.waitForTimeout(600);
      state = await railState(page);
      assert.deepEqual(state, { unavailable: false, tucked: false, railVisible: true, revealShown: false }, label + " speaker playback");

      // Swiping it away by hand still works and survives a trip back to the phone and out again.
      await page.evaluate(() => setSideControlsHidden(true));
      assert.equal((await railState(page)).tucked, true, label + " manual hide");
      device = PHONE;
      await page.evaluate(() => refresh(true));
      await page.waitForFunction(() => document.getElementById("remote").classList.contains("volume-unavailable"));
      device = SPEAKER;
      await page.evaluate(() => refresh(true));
      await page.waitForFunction(() => !document.getElementById("remote").classList.contains("volume-unavailable"));
      assert.equal((await railState(page)).tucked, true, label + " keeps the person's own choice to hide it");
      await page.evaluate(() => setSideControlsHidden(false));
      assert.equal((await railState(page)).tucked, false, label + " manual reveal");

      assert.deepEqual(errors, [], label + " page errors");
      await context.close();
    }
    assert.deepEqual(volumeCalls, [], "no volume requests are sent");
    console.log("volume auto-hide checks passed");
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
