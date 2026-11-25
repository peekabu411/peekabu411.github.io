// Now Playing spotlight tour check. Run with NODE_PATH pointing at a Playwright installation;
// set PW_CHANNEL=msedge to use Edge. No real account is used: Spotify is answered by fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const target = path.resolve(root, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(target, (error, data) => {
    res.writeHead(error ? 404 : 200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
    res.end(error ? "Not found" : data);
  });
});
const track = { type: "track", id: "4iV5W9uYEdYUVa79Axb7Rh", uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh", name: "Control Bar Song", duration_ms: 240000, artists: [{ name: "Test Artist" }], album: { name: "Test Album", images: [{ url: "https://i.scdn.co/image/test-art" }] }, external_urls: { spotify: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh" } };
const calls = [];
let playing = true;
async function fixtures(context) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ path: url.pathname, method: request.method() });
    const headers = { "Access-Control-Allow-Origin": "*" };
    if (url.hostname === "accounts.spotify.com") { await route.fulfill({ json: { access_token: "a", refresh_token: "r", expires_in: 3600 }, headers }); return; }
    if (url.hostname === "api.spotify.com") {
      if (request.method() !== "GET") {
        if (url.pathname.endsWith("/play")) playing = true;
        if (url.pathname.endsWith("/pause")) playing = false;
        await route.fulfill({ status: 204, headers }); return;
      }
      const playback = { item: track, is_playing: playing, progress_ms: 60000, device: { id: "d", name: "Test device", is_active: true, supports_volume: true, volume_percent: 50 }, context: null, shuffle_state: false, repeat_state: "off", actions: { disallows: {} } };
      const json = url.pathname === "/v1/me/library/contains" ? [false] : url.pathname.endsWith("/devices") ? { devices: [playback.device] } : url.pathname.endsWith("/queue") ? { queue: [] } : url.pathname.endsWith("/playlists") ? { items: [] } : url.pathname === "/v1/me" ? { id: "u" } : playback;
      await route.fulfill({ json, headers }); return;
    }
    if (url.hostname === "lrclib.net") { await route.fulfill({ json: { syncedLyrics: "[00:10.00]First line\n[00:50.00]Second line\n[01:10.00]Third line", plainLyrics: "x", instrumental: false }, headers }); return; }
    if (url.hostname === "i.scdn.co") { await route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "icons/turntable-remote-192.png")), headers }); return; }
    await route.fulfill({ contentType: "text/css", body: "", headers });
  });
}
const tourState = page => page.evaluate(() => {
  const hole = document.querySelector(".np-tour-hole"), card = document.querySelector(".np-tour-card");
  const h = hole.getBoundingClientRect(), c = card.getBoundingClientRect();
  return { count: document.getElementById("np-tour-count").textContent, title: document.getElementById("np-tour-title").textContent, hole: { l: h.left, t: h.top, r: h.right, b: h.bottom }, card: { l: c.left, t: c.top, r: c.right, b: c.bottom } };
});
const overlaps = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    for (const [label, viewport, prefs] of [
      ["iPhone, square + dial, bar shown", { width: 844, height: 390 }, {}],
      ["iPhone, vinyl + bar + Divider, bar hidden", { width: 844, height: 390 }, { "turntable-album-style": "vinyl", "turntable-control-style": "bar", "turntable-playback-bar-style": "divider", "turntable-control-bar": "hidden" }],
      ["iPad, bar hidden", { width: 1180, height: 820 }, { "turntable-control-bar": "hidden" }]
    ]) {
      const context = await browser.newContext({ viewport, hasTouch: true });
      context.setDefaultTimeout(10000);
      await fixtures(context);
      await context.addInitScript(p => {
        if (localStorage.getItem("turntable-session")) return;
        localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "t", access_token: "a", refresh_token: "r", expires_at: Date.now() + 600000, scope: "user-library-read user-library-modify" }));
        localStorage.setItem("turntable-session", "github-pages");
        localStorage.setItem("turntable-now-playing-guide-v1", "completed"); // saw the old cards: the new tour is still offered once
        sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
        for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
      }, prefs);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Control Bar Song" && window.turntableTour);
      await page.locator("#now-playing-guide").waitFor({ state: "visible" });
      const callsBefore = calls.length;
      await page.click("#now-playing-guide-next");
      assert(await page.locator("#now-playing-guide").isHidden());
      await page.waitForTimeout(500);
      const titles = [];
      for (;;) {
        await page.waitForTimeout(450);
        const s = await tourState(page);
        titles.push(s.title);
        assert(s.hole.r - s.hole.l > 10 && s.hole.b - s.hole.t > 10, `${label}: step "${s.title}" outlines its control`);
        assert(!overlaps(s.hole, s.card), `${label}: card for "${s.title}" does not cover its control`);
        assert(s.card.l >= 0 && s.card.t >= 0 && s.card.r <= viewport.width && s.card.b <= viewport.height, `${label}: card for "${s.title}" stays on screen`);
        const last = await page.locator('[data-tour="next"]').textContent() === "Done";
        await page.click('[data-tour="next"]');
        if (last) break;
      }
      assert.equal(titles.length, 7, `${label}: all seven steps shown`);
      assert(titles.some(t => /tabs/i.test(t)));
      if (prefs["turntable-control-bar"] === "hidden") assert(titles.includes("Swipe to skip. Tap to play.") && titles.includes("Your compact controls"), `${label}: hidden bar steps`);
      else assert(titles.includes("Playback and queue"));
      if (prefs["turntable-control-style"] === "bar") assert(titles.includes("Swipe the bar. Press to play."));
      assert.equal(await page.evaluate(() => window.turntableTour.isOpen()), false);
      assert.equal(await page.evaluate(() => localStorage.getItem("turntable-now-playing-guide-v2")), "completed");
      assert(await page.locator("#remote.topbar-hidden").count(), `${label}: tab row closes again after the tabs step`);
      assert.equal(calls.slice(callsBefore).filter(c => c.method !== "GET").length, 0, `${label}: the tour sends no playback commands`);

      // Replay from Settings: the tour returns to Now Playing; Escape closes it.
      await page.evaluate(() => switchView("settings"));
      await page.evaluate(() => document.getElementById("start-now-playing-guide").click());
      await page.waitForTimeout(400);
      assert.equal(await page.locator("#remote").getAttribute("data-current-view"), "player");
      assert(await page.evaluate(() => window.turntableTour.isOpen()));
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => window.turntableTour.isOpen()), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("PASS: spotlight tour on iPhone and iPad follows the player's styles, keeps each card clear of its control and on screen, sends no playback commands, restores the tab row, and replays from Settings.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
