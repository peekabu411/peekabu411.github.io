// Smart Mix regression check. Run with NODE_PATH pointing at a Playwright installation;
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
const id = n => String(n).padStart(22, "A").slice(-22).replace(/[^A-Za-z0-9]/g, "B");
const song = (n, artistId = id("artist1"), name = `Song ${n}`) => ({ type: "track", id: id(n), uri: `spotify:track:${id(n)}`, name, duration_ms: 200000, artists: [{ id: artistId, name: "Test Artist" }], album: { name: "Album", images: [{ url: "https://i.scdn.co/image/a" }] } });
const playlistSongs = Array.from({ length: 12 }, (_, i) => song(`list${i}`));
const topSongs = Array.from({ length: 6 }, (_, i) => song(`top${i}`, id("artist2")));
const likedSongs = Array.from({ length: 6 }, (_, i) => song(`liked${i}`, id("artist3")));
const recentSongs = [song("recent0", id("artist4")), playlistSongs[0]];
const albumSongs = Array.from({ length: 5 }, (_, i) => song(`albumsong${i}`));
const albumTracks = albumSongs.map(({ album, ...track }) => track); // Album track lists omit the album.

function scenario(options = {}) {
  return { calls: [], current: playlistSongs[0], shuffle: options.shuffle ?? false, queued: [], scopes: options.scopes ?? "user-library-read user-library-modify user-read-private user-top-read user-read-recently-played" };
}
async function fixtures(context, s) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": "*" };
    if (url.hostname === "accounts.spotify.com") { await route.fulfill({ json: { access_token: "a", refresh_token: "r", expires_in: 3600 }, headers }); return; }
    if (url.hostname === "api.spotify.com") {
      s.calls.push({ path: url.pathname, method: request.method(), search: url.search });
      if (request.method() !== "GET") {
        if (url.pathname.endsWith("/shuffle")) s.shuffle = url.searchParams.get("state") === "true";
        if (url.pathname === "/v1/me/player/queue") s.queued.push(url.searchParams.get("uri"));
        await route.fulfill({ status: 204, headers }); return;
      }
      const playback = { item: s.current, is_playing: true, progress_ms: 60000, device: { id: "dev1", name: "Test device", is_active: true, supports_volume: true, volume_percent: 50 }, context: { type: "playlist", uri: `spotify:playlist:${id("plist")}` }, shuffle_state: s.shuffle, repeat_state: "off", actions: { disallows: {} } };
      const allSongs = [...playlistSongs, ...topSongs, ...likedSongs, ...recentSongs, ...albumSongs];
      const queue = [playlistSongs[5], ...s.queued.map(uri => allSongs.find(t => t.uri === uri)).filter(Boolean)];
      let json = playback;
      if (url.pathname === "/v1/me/library/contains") json = [false];
      else if (url.pathname.endsWith("/devices")) json = { devices: [playback.device] };
      else if (url.pathname === "/v1/me/player/queue") json = { queue };
      else if (url.pathname.endsWith("/playlists")) json = { items: [] };
      else if (url.pathname === "/v1/me/top/tracks") json = { items: topSongs };
      else if (url.pathname === "/v1/me/player/recently-played") json = { items: recentSongs.map(track => ({ track, played_at: new Date().toISOString() })) };
      else if (url.pathname === "/v1/me/tracks") json = { total: likedSongs.length, items: likedSongs.map(track => ({ track })) };
      else if (/^\/v1\/artists\/[^/]+\/albums$/.test(url.pathname)) json = { items: [{ id: id("album1"), name: "Artist Album", images: [{ url: "https://i.scdn.co/image/b" }] }] };
      else if (/^\/v1\/albums\/[^/]+\/tracks$/.test(url.pathname)) json = { items: albumTracks };
      else if (url.pathname === "/v1/me") json = { id: "u" };
      await route.fulfill({ json, headers }); return;
    }
    if (url.hostname === "i.scdn.co") { await route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "icons/turntable-remote-192.png")), headers }); return; }
    await route.fulfill({ contentType: "text/css", body: "", headers });
  });
}
async function open(browser, origin, s, viewport = { width: 844, height: 390 }) {
  const context = await browser.newContext({ viewport, hasTouch: false });
  context.setDefaultTimeout(10000);
  await fixtures(context, s);
  await context.addInitScript(scopes => {
    if (sessionStorage.getItem("smart-mix-test-init")) return;
    sessionStorage.setItem("smart-mix-test-init", "1");
    localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "c", access_token: "a", refresh_token: "r", expires_at: Date.now() + 600000, scope: scopes }));
    localStorage.setItem("turntable-session", "github-pages");
    localStorage.setItem("turntable-now-playing-guide-v1", "completed");
    localStorage.setItem("turntable-now-playing-guide-v2", "completed");
    sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
  }, s.scopes);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.turntableSmartMix && document.querySelector("#title")?.textContent);
  await page.waitForTimeout(600);
  return { context, page, errors };
}
async function hold(page, selector = "#shuffle") {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}
const shuffleWrites = s => s.calls.filter(c => c.path === "/v1/me/player/shuffle").length;
async function advance(page, s, track) {
  s.current = track;
  await page.evaluate(() => refresh(true));
  await page.waitForTimeout(350);
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    // 1. Holding Shuffle opens the menu without toggling shuffle.
    let s = scenario();
    let { context, page, errors } = await open(browser, origin, s);
    assert.equal(await page.locator("#smart-mix-menu").isHidden(), true);
    await hold(page);
    assert.equal(await page.locator("#smart-mix-menu").isVisible(), true, "hold opens the menu");
    assert.equal(shuffleWrites(s), 0, "a hold must not also toggle shuffle");
    assert.equal(await page.locator('[data-smart-mode="off"]').getAttribute("aria-checked"), "true");
    assert.equal(await page.locator(".smart-mix-spotify").getAttribute("href"), `https://open.spotify.com/playlist/${id("plist")}`, "Spotify row opens the current playlist");
    assert.equal(await page.locator(".smart-mix-reconnect").isHidden(), true);
    const menuBox = await page.locator("#smart-mix-menu").boundingBox();
    assert(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= 844 && menuBox.y + menuBox.height <= 390, "menu fits on an iPhone screen");

    // 2. Choosing Smart Mix turns shuffle on and queues one pick right away.
    await page.click('[data-smart-mode="smart"]');
    await page.waitForFunction(() => document.getElementById("shuffle").classList.contains("smart"));
    await page.waitForTimeout(900);
    assert.equal(s.shuffle, true, "Smart Mix turns Spotify shuffle on");
    assert.equal(s.queued.length, 1, "first pick queued right away");
    const firstPick = s.queued[0];
    assert.notEqual(firstPick, playlistSongs[0].uri, "pick is not the current song");
    assert.notEqual(firstPick, playlistSongs[5].uri, "pick is not already in the queue");
    const queueCall = s.calls.find(c => c.path === "/v1/me/player/queue" && c.method === "POST");
    assert.match(queueCall.search, /device_id=dev1/, "pick goes to the active device");
    assert.equal(await page.evaluate(() => localStorage.getItem("turntable-smart-mix")), "on");

    // 3. The queue drawer marks the pick.
    await page.click("#queue-toggle");
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#queue-list .smart-pick-badge").count(), 1, "pick is marked in the queue");
    await page.click("#queue-close");

    // 4. No second pick while one is waiting; the next comes after 3 more songs.
    await advance(page, s, playlistSongs[1]);
    assert.equal(s.queued.length, 1, "a waiting pick blocks another");
    const pickTrack = [...topSongs, ...likedSongs, ...recentSongs, ...albumSongs].find(t => t.uri === firstPick);
    await advance(page, s, pickTrack);
    await advance(page, s, playlistSongs[2]);
    await advance(page, s, playlistSongs[3]);
    assert.equal(s.queued.length, 1, "no pick before 3 songs");
    await advance(page, s, playlistSongs[4]);
    await page.waitForTimeout(600);
    assert.equal(s.queued.length, 2, "a new pick after 3 songs");
    assert.notEqual(s.queued[1], firstPick, "picks do not repeat");

    // 5. Tapping Shuffle while Smart Mix is on turns both off.
    const before = shuffleWrites(s);
    await page.click("#shuffle");
    await page.waitForTimeout(700);
    assert.equal(await page.locator("#shuffle").evaluate(el => el.classList.contains("smart")), false);
    assert.equal(shuffleWrites(s), before + 1);
    assert.equal(s.shuffle, false);
    assert.deepEqual(errors, []);
    await context.close();

    // 6. Shuffle turned off elsewhere ends Smart Mix on the next fresh status.
    s = scenario({ shuffle: true });
    ({ context, page, errors } = await open(browser, origin, s));
    await hold(page);
    await page.click('[data-smart-mode="smart"]');
    await page.waitForTimeout(800);
    s.shuffle = false;
    await page.evaluate(() => refresh(true));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => turntableSmartMix.isEnabled()), false, "Smart Mix follows shuffle off");
    assert.deepEqual(errors, []);
    await context.close();

    // 7. Older connections without the new scopes still get picks and a reconnect row.
    s = scenario({ shuffle: true, scopes: "user-library-read user-library-modify user-read-private" });
    ({ context, page, errors } = await open(browser, origin, s));
    await hold(page);
    await page.click('[data-smart-mode="smart"]');
    await page.waitForTimeout(1200);
    // Several picks walk the source rotation, so top songs and recent plays are both tried.
    assert.equal(s.queued.length, 1, "first pick queued without the new scopes");
    const allPicks = [...topSongs, ...likedSongs, ...recentSongs, ...albumSongs];
    await advance(page, s, allPicks.find(t => t.uri === s.queued[0]));
    for (const next of [playlistSongs[1], playlistSongs[2], playlistSongs[3]]) await advance(page, s, next);
    await page.waitForTimeout(600);
    assert(s.queued.length >= 2, "picks still come from Liked Songs and the artist");
    assert.equal(s.calls.some(c => c.path === "/v1/me/top/tracks" || c.path === "/v1/me/player/recently-played"), false, "no calls that need missing scopes");
    await hold(page);
    assert.equal(await page.locator(".smart-mix-reconnect").isVisible(), true, "reconnect row shown");
    assert.deepEqual(errors, []);
    await context.close();

    // 8. iPad and the hidden control bar keep the menu on screen.
    s = scenario();
    ({ context, page, errors } = await open(browser, origin, s, { width: 1180, height: 820 }));
    await page.evaluate(() => applyControlBar("hidden"));
    await page.waitForTimeout(300);
    await hold(page);
    const padBox = await page.locator("#smart-mix-menu").boundingBox();
    assert(padBox.x >= 0 && padBox.y >= 0 && padBox.x + padBox.width <= 1180 && padBox.y + padBox.height <= 820, "menu fits with the hidden control bar");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#smart-mix-menu").isHidden(), true);
    assert.deepEqual(errors, []);
    await context.close();

    console.log("PASS: hold Shuffle menu, Smart Mix picks every 3 songs, queue marks, no repeats, shuffle off ends it, missing scopes, Spotify link, iPad and hidden control bar.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
