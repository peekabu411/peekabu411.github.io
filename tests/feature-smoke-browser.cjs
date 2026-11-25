// Feature smoke test: every main control still reaches Spotify the same way.
// Used as the "nothing broke" gate for the cleanup refactors. No real account is used:
// Spotify and LRCLIB are answered by fixtures and every request is recorded.
// Run: node tests/feature-smoke-browser.cjs  (PW_CHANNEL=msedge to use Edge)
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

const T = (name, id) => ({ type: "track", id, uri: "spotify:track:" + id, name, duration_ms: 214000, artists: [{ name: "Smoke Artist" }], album: { name: "Smoke", images: [{ url: "https://i.scdn.co/image/" + id }] }, external_urls: { spotify: "https://open.spotify.com/track/" + id } });
const track = T("Smoke Song", "4iV5W9uYEdYUVa79Axb7Rh");
const queue = [T("Queued One", "1301WleyT98MSxVHPZCA6M"), T("Queued Two", "3n3Ppam7vgaVa1iaRUc9Lp")];
const devices = [
  { id: "speaker", name: "Living room", type: "Speaker", is_active: true, supports_volume: true, volume_percent: 50 },
  { id: "laptop", name: "Office laptop", type: "Computer", is_active: false, supports_volume: true, volume_percent: 30 }
];
const playlist = { id: "37i9dQZF1DXcBWIGoYBM5M", uri: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", name: "Smoke Playlist", description: "", images: [], owner: { display_name: "You" }, items: { total: 12 } };
const calls = [];
const state = { playing: true, liked: false };

async function fixtures(context) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { "Access-Control-Allow-Origin": "*" };
    const method = request.method();
    calls.push({ host: url.hostname, method, path: url.pathname, query: url.search, body: request.postData() || "" });
    if (url.hostname === "accounts.spotify.com") return route.fulfill({ json: { access_token: "a", refresh_token: "r", expires_in: 3600 }, headers });
    if (url.hostname === "api.spotify.com") {
      if (method !== "GET") {
        if (url.pathname.endsWith("/play")) state.playing = true;
        if (url.pathname.endsWith("/pause")) state.playing = false;
        if (url.pathname.startsWith("/v1/me/library")) state.liked = method === "PUT";
        return route.fulfill({ status: 204, headers });
      }
      const playback = { item: track, is_playing: state.playing, progress_ms: 60000, device: devices[0], context: null, shuffle_state: true, repeat_state: "off", actions: { disallows: {} } };
      const p = url.pathname;
      const json = p === "/v1/me/library/contains" ? [state.liked]
        : p.endsWith("/devices") ? { devices }
        : p.endsWith("/queue") ? { currently_playing: track, queue }
        : p === "/v1/me/playlists" ? { items: [playlist] }
        : p === "/v1/me/tracks" ? { total: 3, items: [{ track }] }
        : p === "/v1/me" ? { id: "smoke-user", country: "US" }
        : playback;
      return route.fulfill({ json, headers });
    }
    if (url.hostname === "lrclib.net") return route.fulfill({ json: { syncedLyrics: "[00:10.00]First line\n[00:50.00]Second line\n[01:10.00]Third line", plainLyrics: "x", instrumental: false }, headers });
    if (url.hostname === "i.scdn.co") return route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "icons/turntable-remote-192.png")), headers });
    return route.fulfill({ contentType: "text/css", body: "", headers });
  });
}

const spotifyCalls = (since, method, pathPart) => calls.slice(since).filter(c => c.host === "api.spotify.com" && c.method === method && c.path.includes(pathPart));
async function expectCall(page, label, method, pathPart, check = () => true) {
  const since = calls.length;
  return {
    async after(action) {
      await action();
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const hit = spotifyCalls(since, method, pathPart).find(check);
        if (hit) { console.log(`  ok  ${label}: ${method} ${hit.path}${hit.query}`); await page.waitForTimeout(900); return hit; }
        await page.waitForTimeout(100);
      }
      assert.fail(`${label}: expected ${method} …${pathPart}; saw ${calls.slice(since).map(c => c.method + " " + c.path + c.query).join(", ") || "nothing"}`);
    }
  };
}
// The app warns past 30 Spotify requests a minute; this test makes that many on purpose.
const dismissRateWarning = page => page.evaluate(() => { const w = document.getElementById("rate-warning"); if (w && !w.hidden) document.getElementById("rate-warning-dismiss").click(); });
const openView = (page, view) => dismissRateWarning(page).then(() => page.evaluate(view => { document.getElementById("remote").classList.remove("topbar-hidden"); document.querySelector(`[data-view="${view}"]`).click(); }, view));

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    context.setDefaultTimeout(10000);
    await fixtures(context);
    await context.addInitScript(() => {
      if (sessionStorage.getItem("smoke-init")) return;
      sessionStorage.setItem("smoke-init", "1");
      localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "smoke-client", access_token: "a", refresh_token: "r", expires_at: Date.now() + 3_600_000, scope: "user-library-read user-library-modify user-read-private" }));
      localStorage.setItem("turntable-session", "github-pages");
      localStorage.setItem("turntable-now-playing-guide-v1", "completed");
      localStorage.setItem("turntable-now-playing-guide-v2", "completed");
      localStorage.setItem("turntable-album-style", "square");
      sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Smoke Song");
    console.log("  ok  startup shows the current Spotify song");
    await page.waitForTimeout(1200);

    await (await expectCall(page, "pause", "PUT", "/me/player/pause")).after(() => page.click("#play"));
    await (await expectCall(page, "play", "PUT", "/me/player/play")).after(() => page.click("#play"));
    await (await expectCall(page, "next", "POST", "/me/player/next")).after(() => page.click("#next"));
    await (await expectCall(page, "previous", "POST", "/me/player/previous")).after(() => page.click("#previous"));
    await (await expectCall(page, "shuffle off", "PUT", "/me/player/shuffle", c => c.query.includes("state=false"))).after(() => page.click("#shuffle"));
    await (await expectCall(page, "repeat", "PUT", "/me/player/repeat", c => /state=(context|track)/.test(c.query))).after(() => page.click("#repeat"));
    await (await expectCall(page, "seek", "PUT", "/me/player/seek", c => /position_ms=\d+/.test(c.query))).after(() => page.evaluate(() => {
      const seek = document.getElementById("seek"); seek.value = String(Math.round(Number(seek.max || 1000) / 2));
      seek.dispatchEvent(new Event("input", { bubbles: true })); seek.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    await (await expectCall(page, "volume", "PUT", "/me/player/volume", c => c.query.includes("volume_percent=70"))).after(() => page.evaluate(() => {
      const volume = document.getElementById("volume"); volume.value = "70";
      volume.dispatchEvent(new Event("input", { bubbles: true })); volume.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    await (await expectCall(page, "like song", "PUT", "/me/library")).after(() => page.click("#track-like"));
    await (await expectCall(page, "unlike song", "DELETE", "/me/library")).after(() => page.click("#track-like"));

    assert.ok(calls.some(c => c.path === "/v1/me/player/queue"), "queue is read from Spotify");
    await page.click("#queue-toggle");
    await page.waitForFunction(() => document.querySelectorAll("#queue-list .queue-item").length === 2);
    console.log("  ok  queue drawer lists the upcoming songs");
    await page.locator("#queue-list .queue-play-next").first().click();
    assert.equal(await page.locator("#queue-list .queue-play-next").first().textContent(), "Cancel");
    console.log("  ok  queue Play next arms the chosen song");
    await page.locator("#queue-list .queue-play-next").first().click();
    await page.evaluate(() => document.getElementById("queue-toggle").click());
    await page.waitForTimeout(500);

    await (await expectCall(page, "playlists load", "GET", "/me/playlists")).after(() => openView(page, "playlists"));
    await page.waitForSelector(`.playlist-card[data-playlist-id="${playlist.id}"]`);
    await (await expectCall(page, "play a playlist", "PUT", "/me/player/play", c => c.body.includes(playlist.uri))).after(() => page.locator(`.playlist-card[data-playlist-id="${playlist.id}"] .playlist-play`).click());
    await openView(page, "playlists");
    await (await expectCall(page, "play Liked Songs", "PUT", "/me/player/play", c => c.body.includes("collection") || c.body.includes("uris"))).after(() => page.locator('.playlist-card[data-playlist-id="turntable:liked-songs"] .playlist-play').click());

    await (await expectCall(page, "devices load", "GET", "/me/player/devices")).after(() => openView(page, "devices"));
    await page.waitForTimeout(300);
    await dismissRateWarning(page);
    await (await expectCall(page, "switch device", "PUT", "/me/player", c => c.path === "/v1/me/player" && c.body.includes("laptop"))).after(() => page.locator("#device-list button:not([disabled])").first().click());

    await openView(page, "settings");
    const lyricsSince = calls.length;
    await page.locator('[data-display-choice="lyrics"]').first().click();
    await page.waitForFunction(() => document.querySelector("#lyrics-panel")?.textContent.includes("line"), null, { timeout: 8000 });
    assert.ok(calls.slice(lyricsSince).some(c => c.host === "lrclib.net"), "lyrics are fetched from LRCLIB");
    console.log("  ok  lyrics load from LRCLIB");
    await page.locator('[data-display-choice="info"]').first().click();

    await openView(page, "devices");
    await page.click("#unpair-phone");
    await page.waitForLoadState("load");
    assert.equal(await page.evaluate(() => localStorage.getItem("turntable-ios-oauth")), null);
    assert.equal(await page.locator("#pairing").isVisible(), true);
    console.log("  ok  disconnect clears the saved sign-in and shows setup");

    // Setup: pasting a Client ID and pressing Connect hands off to Spotify's approval page.
    let authorizeUrl = null;
    await context.route("https://accounts.spotify.com/authorize**", route => { authorizeUrl = route.request().url(); return route.fulfill({ contentType: "text/html", body: "<p>Spotify approval</p>" }); });
    await page.fill("#pin", "smoke-client-id");
    await page.click("#pair");
    await page.waitForURL(/accounts\.spotify\.com\/authorize/);
    const approval = new URL(authorizeUrl);
    assert.equal(approval.searchParams.get("client_id"), "smoke-client-id");
    assert.equal(approval.searchParams.get("code_challenge_method"), "S256");
    console.log("  ok  setup Connect opens Spotify approval with the pasted Client ID");

    assert.deepEqual(errors, [], "no uncaught page errors");
    if (process.env.SMOKE_LOG) fs.writeFileSync(process.env.SMOKE_LOG, calls.filter(c => c.host === "api.spotify.com" || c.host === "lrclib.net").map(c => `${c.method} ${c.host}${c.path}${c.query} ${c.body}`).join("\n") + "\n");
    console.log("Feature smoke test passed.");
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
