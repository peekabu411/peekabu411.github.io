// Run with NODE_PATH pointing at a Playwright installation; no real account is used.
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
const fakeAuth = { client_id: "test-client", access_token: "test-access", refresh_token: "test-refresh", expires_at: Date.now() + 600000, scope: "user-library-read user-library-modify" };
const track = { type: "track", id: "4iV5W9uYEdYUVa79Axb7Rh", uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh", name: "Security Test Song", duration_ms: 240000, artists: [{ name: "Test Artist" }], album: { name: "Test Album", images: [{ url: "https://i.scdn.co/image/test-art" }] }, external_urls: { spotify: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh" } };
const calls = [];
let playing = false;
let liked = false;
async function fixtures(context) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ url: url.href, method: request.method() });
    const headers = { "Access-Control-Allow-Origin": "*" };
    if (url.hostname === "accounts.spotify.com") { await route.fulfill({ json: { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 }, headers }); return; }
    if (url.hostname === "api.spotify.com") {
      if (request.method() !== "GET") {
        if (url.pathname === "/v1/me/library") liked = request.method() === "PUT";
        if (url.pathname.endsWith("/play")) playing = true;
        if (url.pathname.endsWith("/pause")) playing = false;
        await route.fulfill({ status: 204, headers }); return;
      }
      const playback = { item: track, is_playing: playing, progress_ms: 60000, device: { id: "test-device", name: "Test device", is_active: true, supports_volume: true, volume_percent: 50 }, context: null, shuffle_state: false, repeat_state: "off", actions: { disallows: {} } };
      const json = url.pathname === "/v1/me/library/contains" ? [liked] : url.pathname.endsWith("/devices") ? { devices: [playback.device] } : url.pathname.endsWith("/queue") ? { queue: [] } : url.pathname.endsWith("/playlists") ? { items: [] } : url.pathname.endsWith("/tracks") ? { total: 1, items: [{ track }] } : url.pathname === "/v1/me" ? { id: "test-user" } : playback;
      await route.fulfill({ json, headers }); return;
    }
    if (url.hostname === "lrclib.net") { await route.fulfill({ json: { syncedLyrics: "[00:10.00]Test lyric line\n[00:20.00]Next lyric", plainLyrics: "Test lyric line\nNext lyric", instrumental: false }, headers }); return; }
    if (url.hostname === "i.scdn.co") { await route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "icons/turntable-remote-192.png")), headers }); return; }
    // Font/network fixtures avoid using external services during regression checks.
    await route.fulfill({ contentType: "text/css", body: "", headers });
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
    context.setDefaultTimeout(10000);
    await fixtures(context);
    await context.addInitScript(() => {
      window.cspViolations = [];
      document.addEventListener("securitypolicyviolation", event => window.cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI }));
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.turntableAuth?.disconnect === "function" && typeof openNowPlayingGuide === "function");
    assert(await page.locator("#pairing").isVisible());
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    await page.evaluate(auth => {
      localStorage.setItem("turntable-ios-oauth", JSON.stringify(auth));
      localStorage.setItem("turntable-session", "github-pages");
      localStorage.setItem("turntable-now-playing-guide-v1", "completed");
      sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
    }, fakeAuth);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Security Test Song");
    assert(await page.locator("#remote").isVisible());
    await page.waitForFunction(() => document.querySelector("#cover").naturalWidth > 0);
    await page.waitForFunction(() => !document.querySelector("#track-like").disabled);
    const readsBefore = calls.filter(call => new URL(call.url).pathname === "/v1/me/library/contains").length;
    await page.evaluate(() => { for (let i = 0; i < 5; i++) render(state); });
    assert.equal(calls.filter(call => new URL(call.url).pathname === "/v1/me/library/contains").length, readsBefore);
    await page.locator("#track-like").click();
    await page.waitForFunction(() => document.querySelector("#track-like").getAttribute("aria-pressed") === "true");
    assert.equal(liked, true);
    await page.locator("#track-like").click();
    await page.waitForFunction(() => document.querySelector("#track-like").getAttribute("aria-pressed") === "false");
    assert.equal(liked, false);
    assert(calls.some(call => new URL(call.url).pathname === "/v1/me/library" && call.method === "PUT"));
    assert(calls.some(call => new URL(call.url).pathname === "/v1/me/library" && call.method === "DELETE"));
    for (const viewport of [{ width: 852, height: 393 }, { width: 1366, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const art = await page.locator(".art-stage").boundingBox(), heart = await page.locator("#track-like").boundingBox();
      const player = await page.locator("#remote").boundingBox(), spotify = await page.locator("#spotify-track-link").boundingBox();
      assert(heart && spotify && player && Math.abs(heart.y - spotify.y) < 2, "heart and Spotify control share a top edge");
      assert(Math.abs((heart.x - player.x) - (player.x + player.width - spotify.x - spotify.width)) < 2, "heart mirrors the Spotify corner inset");
      assert.equal(heart.width, 44, "keep the larger heart size");
      assert(heart.x + heart.width <= art.x || heart.x >= art.x + art.width || heart.y + heart.height <= art.y || heart.y >= art.y + art.height, "heart does not overlap artwork");
      assert.equal(await page.locator(".art-stage #track-like").count(), 0);
      assert(heart.x >= 0 && heart.y >= 0 && heart.x + heart.width <= viewport.width);
    }
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.screenshot({ path: path.join(process.env.TEMP, "turntable-song-likes.png") });
    await page.evaluate(() => applyAppearance("vinyl"));
    assert.equal(await page.locator("#remote").getAttribute("data-album"), "vinyl");
    assert(await page.locator("#track-like").isVisible());
    await page.screenshot({ path: path.join(process.env.TEMP, "turntable-song-likes-vinyl.png") });
    // Existing read-only connections must prompt rather than silently pretend to save.
    await page.evaluate(() => {
      const auth = JSON.parse(localStorage.getItem("turntable-ios-oauth"));
      auth.scope = "user-library-read";
      localStorage.setItem("turntable-ios-oauth", JSON.stringify(auth));
    });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#track-like").disabled);
    await page.locator("#track-like").click();
    assert(await page.locator("#library-permission").isVisible());
    await page.locator("#library-permission-dismiss").click();
    assert(await page.locator("#library-permission").isHidden());
    console.log("PASS: real heart save/remove, phone/tablet placement, and reconnect permission dialog.");
    await page.locator("#play").click();
    await page.waitForFunction(() => document.querySelector("#play").getAttribute("aria-label") === "Pause");
    await page.evaluate(() => setTopBarHidden(false));
    await page.locator('[data-view="playlists"]').click();
    assert(await page.locator("#track-like").isHidden());
    await page.getByText("Liked Songs", { exact: true }).waitFor();
    await page.evaluate(() => setTopBarHidden(false));
    await page.locator('[data-view="devices"]').click();
    await page.getByText("Test device", { exact: true }).waitFor();
    await page.evaluate(async () => {
      await fetch("/api/settings", { body: JSON.stringify({ volume_percent: 35 }) });
      await fetch("/api/lyrics?id=1");
    });
    assert(calls.some(call => call.url.includes("/me/player/volume")));
    assert(calls.some(call => call.url.includes("lrclib.net")));
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    assert.deepEqual(errors, []);
    console.log("PASS: browser setup, saved login, artwork, playback, playlists/Liked Songs, devices, volume and lyrics requests; no unexpected CSP violations or JS errors.");
    await page.evaluate(() => {
      const probe = document.createElement("img");
      probe.setAttribute("onerror", "window.inlineScriptExecuted=true");
      document.body.append(probe);
      probe.dispatchEvent(new Event("error"));
    });
    assert.equal(await page.evaluate(() => window.inlineScriptExecuted), undefined);
    console.log("PASS: CSP blocks injected inline event-handler script.");
    // Verify the actual service worker in the browser, not just a mock.
    await page.evaluate(async () => {
      const other = await caches.open("another-app-cache");
      await other.put("/other.txt", new Response("keep"));
      const old = await caches.open("turntable-ios-old-test");
      await old.put("/?code=old-secret", new Response("old callback"));
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.evaluate(async origin => { await fetch(origin + "/?code=secret&state=secret"); }, origin);
    const cacheState = await page.evaluate(async () => {
      const names = await caches.keys(), urls = [];
      for (const name of names) if (name.startsWith("turntable-ios-")) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      return { names, urls };
    });
    assert(cacheState.names.includes("another-app-cache"));
    assert(!cacheState.names.includes("turntable-ios-old-test"));
    assert(!cacheState.urls.some(url => new URL(url).searchParams.has("code")));
    console.log("PASS: real service worker excludes OAuth callbacks, removes old Turntable cache, and preserves other apps' caches.");
    await page.evaluate(() => switchView("devices"));
    await page.locator("#unpair-phone").click();
    await page.waitForFunction(() => !localStorage.getItem("turntable-ios-oauth") && !document.querySelector("#pairing").hidden);
    console.log("PASS: real Unpair button clears credentials and returns to setup.");
    await context.close();
    const callbackContext = await browser.newContext();
    await fixtures(callbackContext);
    await callbackContext.addInitScript(() => {
      localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "test-client" }));
      sessionStorage.setItem("tt.state", "test-state");
      sessionStorage.setItem("tt.verifier", "test-verifier");
    });
    const callbackPage = await callbackContext.newPage();
    await callbackPage.goto(origin + "/?code=test-code&state=test-state&keep=1");
    await callbackPage.getByRole("heading", { name: "Connected.", exact: true }).waitFor();
    assert.equal(new URL(callbackPage.url()).search, "?keep=1");
    assert.equal(await callbackPage.evaluate(() => sessionStorage.getItem("tt.state")), null);
    assert.equal(await callbackPage.locator(".return-action").getAttribute("href"), origin + "/");
    console.log("PASS: successful OAuth callback clears state/URL and retains the Connected return card.");
    await callbackContext.close();
    const errorContext = await browser.newContext();
    await errorContext.addInitScript(() => {
      localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "test-client" }));
      sessionStorage.setItem("tt.state", "test-state");
      sessionStorage.setItem("tt.verifier", "test-verifier");
    });
    const maliciousError = '<img src=x onerror="window.errorScriptExecuted=true">';
    await errorContext.route("https://accounts.spotify.com/api/token", route => route.fulfill({ status: 400, json: { error_description: maliciousError }, headers: { "Access-Control-Allow-Origin": "*" } }));
    const errorPage = await errorContext.newPage();
    await errorPage.goto(origin + "/?code=test-code&state=test-state");
    await errorPage.locator(".connection-message").waitFor();
    assert.equal(await errorPage.locator(".connection-message").textContent(), maliciousError);
    assert.equal(await errorPage.locator(".connection-message img").count(), 0);
    assert.equal(await errorPage.evaluate(() => window.errorScriptExecuted), undefined);
    assert.equal(new URL(errorPage.url()).search, "");
    console.log("PASS: actual browser renders malicious OAuth error as text, never as injected HTML.");
    await errorContext.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
