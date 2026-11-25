// Hidden control bar regression check. Run with NODE_PATH pointing at a Playwright installation;
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
const box = (page, selector) => page.locator(selector).first().boundingBox();
const parentOf = (page, selector) => page.evaluate(sel => {
  const node = document.querySelector(sel).parentElement;
  return node.id ? "#" + node.id : "." + [...node.classList].join(".");
}, selector);
async function swipe(page, x, y, dy) {
  await page.mouse.move(x, y); await page.mouse.down();
  for (let step = 1; step <= 6; step++) await page.mouse.move(x, y + (dy * step) / 6);
  await page.mouse.up();
}
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
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
    await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Control Bar Song" && typeof getControlBarState === "function" && typeof window.turntablePresetDirtyCheck === "function");

    // Shown by default: the original bar and queue button stay where they were.
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "shown");
    assert.equal(await parentOf(page, ".transport"), ".player-info");
    assert.equal(await parentOf(page, "#queue-toggle"), "#remote");
    const shownArt = await box(page, ".art-stage");

    // Settings switch hides it, marks the preset unsaved, and saving keeps it after a reload.
    await page.evaluate(() => setTopBarHidden(false));
    await page.locator('[data-view="settings"]').click();
    await page.locator('[data-control-bar-choice="hidden"]').click();
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "hidden");
    assert.equal(await page.locator('[data-control-bar-choice="hidden"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#preset-save").textContent(), "Save*");
    await page.locator("#preset-save").click();
    assert.equal(await page.locator("#preset-save").textContent(), "Saved");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Control Bar Song" && typeof getControlBarState === "function");
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "hidden");
    await page.evaluate(() => { setTopBarHidden(false); document.querySelector('[data-view="player"]').click(); setTopBarHidden(true); });

    // Default playback bar: one compact row between the times, artwork about 30% larger.
    assert.equal(await page.evaluate(() => document.querySelector(".transport").parentElement.parentElement.classList.contains("timeline")), true);
    assert.equal(await parentOf(page, "#queue-toggle"), ".transport");
    const order = await page.evaluate(() => [...document.querySelector(".transport").children].map(node => node.id));
    assert.deepEqual(order, ["shuffle", "previous", "play", "next", "repeat", "queue-toggle"]);
    const hiddenArt = await box(page, ".art-stage");
    assert(hiddenArt.width >= shownArt.width * 1.12, `artwork grows (${shownArt.width} -> ${hiddenArt.width})`);
    const row = await box(page, ".transport"), elapsed = await box(page, "#elapsed"), duration = await box(page, "#duration");
    const firstButton = await box(page, "#shuffle"), lastButton = await box(page, "#queue-toggle");
    assert(firstButton.x > elapsed.x + elapsed.width && lastButton.x + lastButton.width < duration.x, "row sits between the times");
    assert(row.y + row.height <= 390, "row is on screen");
    const heart = await box(page, "#track-like");
    assert(heart.y + heart.height <= hiddenArt.y || heart.x + heart.width <= hiddenArt.x, "heart clears the larger artwork");
    for (const id of ["#shuffle", "#previous", "#play", "#next", "#repeat", "#queue-toggle"]) assert(await page.locator(id).isVisible(), `${id} visible`);
    const rail = await box(page, ".dial-rail");
    assert(Math.abs(rail.y + rail.height - 390) < 2, "volume control extends to the bottom when the bar is hidden");

    // Queue still opens from the compact row.
    await page.locator("#queue-toggle").click();
    assert.equal(await page.locator("#remote").evaluate(node => node.classList.contains("queue-open")), true);
    await page.locator("#queue-close").click();
    await page.waitForTimeout(350);

    // Tapping the artwork plays or pauses, and only while the bar is hidden.
    await page.waitForFunction(() => document.querySelector("#play").getAttribute("aria-label") === "Pause");
    const pausesBefore = calls.filter(call => call.path.endsWith("/pause")).length;
    await page.mouse.click(hiddenArt.x + hiddenArt.width / 2, hiddenArt.y + hiddenArt.height / 2);
    await page.waitForFunction(() => document.querySelector("#play").getAttribute("aria-label") === "Play");
    assert.equal(calls.filter(call => call.path.endsWith("/pause")).length, pausesBefore + 1);
    assert(await page.locator(".tap-play-hint").isVisible());

    // Swipe up from just above the bottom edge brings the bar back without opening the top tabs.
    await swipe(page, 300, 375, -80);
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "shown");
    assert.equal(await page.locator("#remote").evaluate(node => node.classList.contains("topbar-hidden")), true);
    assert.equal(await parentOf(page, ".transport"), ".player-info");
    assert.equal(await parentOf(page, "#queue-toggle"), "#remote");
    assert.equal(await page.locator(".tap-play-hint").isVisible(), false);
    const playsBefore = calls.filter(call => call.path.endsWith("/play")).length;
    const artNow = await box(page, ".art-stage");
    await page.mouse.click(artNow.x + artNow.width / 2, artNow.y + artNow.height / 2);
    await page.waitForTimeout(300);
    assert.equal(calls.filter(call => call.path.endsWith("/play")).length, playsBefore, "tap does nothing while the bar is shown");

    // Swipe down on the bar hides it again; the gesture does not press the button under it.
    const shuffleBox = await box(page, "#shuffle");
    const putsBefore = calls.filter(call => call.method === "PUT").length;
    await swipe(page, shuffleBox.x + shuffleBox.width / 2, shuffleBox.y + 4, 60);
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "hidden");
    await page.waitForTimeout(300);
    assert.equal(calls.filter(call => call.method === "PUT").length, putsBefore, "no shuffle request from the swipe");

    // Divider playback bar: row under the song (D1), progress line pinned to the bottom edge.
    await page.evaluate(() => applyAppearance(albumStyle, controlStyle, "info", lyricsBackground, playerBackgroundStyle, lyricStyle, "divider"));
    assert.equal(await parentOf(page, ".transport"), ".track-copy");
    const artist = await box(page, "#artist"), dividerRow = await box(page, ".transport"), dividerArt = await box(page, ".art-stage");
    // Mini player pill: centred on the screen, just above the bottom edge (or the home bar), clear of the artwork.
    const pill = await box(page, ".timeline");
    assert(Math.abs(pill.x + pill.width / 2 - 422) < 1 && pill.width < 320 && pill.y + pill.height <= 387 && pill.y + pill.height >= 380, `pill centred above the bottom edge (${JSON.stringify(pill)})`);
    assert(pill.y >= dividerArt.y + dividerArt.height || pill.x >= dividerArt.x + dividerArt.width, "pill clears the artwork");
    assert(await page.locator("#elapsed").isVisible() && await page.locator("#duration").isVisible(), "pill shows the times");
    await page.evaluate(() => document.querySelector(".timeline").style.setProperty("--home-bar", "21px"));
    const homePill = await box(page, ".timeline");
    assert(homePill.y + homePill.height <= 390 - 21 - 2, `pill sits fully above the home bar (${JSON.stringify(homePill)})`);
    await page.evaluate(() => document.querySelector(".timeline").style.removeProperty("--home-bar"));
    // Dragging the pill straight away lifts it into the full scrubber and seeks from where the song was.
    const seeksBefore = calls.filter(call => call.path.endsWith("/seek")).length;
    const valueBefore = Number(await page.locator("#seek").inputValue());
    await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
    await page.mouse.down();
    assert(await page.evaluate(() => document.querySelector(".timeline").classList.contains("lifted")), "pressing the pill lifts the scrubber");
    for (let step = 1; step <= 6; step += 1) await page.mouse.move(pill.x + pill.width / 2 + step * 25, pill.y + pill.height / 2);
    await page.mouse.up();
    const valueAfter = Number(await page.locator("#seek").inputValue());
    assert(valueAfter > valueBefore && valueAfter - valueBefore < Number(await page.locator("#seek").getAttribute("max")) * .4, `drag scrubs forward relative to the song position (${valueBefore} -> ${valueAfter})`);
    await page.waitForTimeout(400);
    assert.equal(calls.filter(call => call.path.endsWith("/seek")).length, seeksBefore + 1, "drag sends one seek");
    const lifted = await box(page, ".timeline");
    assert(lifted.width >= 800 && lifted.y + lifted.height <= 387, `lifted scrubber spans the screen (${JSON.stringify(lifted)})`);
    await page.waitForFunction(() => !document.querySelector(".timeline").classList.contains("lifted"), null, { timeout: 4000 });
    // A plain tap only lifts it (no seek); a tap on the lifted scrubber seeks to that point.
    await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
    assert(await page.evaluate(() => document.querySelector(".timeline").classList.contains("lifted")), "tap lifts the scrubber");
    await page.waitForTimeout(400);
    assert.equal(calls.filter(call => call.path.endsWith("/seek")).length, seeksBefore + 1, "tap to lift does not seek");
    const liftedSeek = await box(page, "#seek");
    await page.mouse.click(liftedSeek.x + liftedSeek.width * .75, liftedSeek.y + liftedSeek.height / 2);
    const tapped = Number(await page.locator("#seek").inputValue()), maximum = Number(await page.locator("#seek").getAttribute("max"));
    assert(Math.abs(tapped / maximum - .75) < .03, `tap on the lifted scrubber seeks there (${tapped / maximum})`);
    await page.waitForFunction(() => !document.querySelector(".timeline").classList.contains("lifted"), null, { timeout: 4000 });
    assert(dividerRow.y >= artist.y + artist.height, "row sits under the artist");
    assert(dividerRow.x >= dividerArt.x + dividerArt.width, "row does not overlap the artwork");
    await page.evaluate(() => applyAppearance(albumStyle, controlStyle, "lyrics", lyricsBackground, playerBackgroundStyle, lyricStyle, "divider"));
    await page.waitForFunction(() => document.querySelector("#remote").dataset.display === "lyrics");
    assert.equal(await page.evaluate(() => document.querySelector(".transport").previousElementSibling.id), "lyrics-panel");

    // Switching presets applies each preset's own choice.
    await page.evaluate(() => { setTopBarHidden(false); });
    await page.locator("#top-preset-select").selectOption("default");
    if (await page.locator("#preset-discard-switch").isVisible()) await page.locator("#preset-discard-switch").click();
    assert.equal(await page.locator("#remote").getAttribute("data-control-bar"), "shown");

    // Large tablet / desktop landscape: the larger artwork still fits, and the row stays between the times.
    await page.evaluate(() => { applyControlBar("hidden"); applyAppearance(albumStyle, controlStyle, "info", lyricsBackground, playerBackgroundStyle, lyricStyle, "default"); setTopBarHidden(true); });
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.waitForTimeout(200);
    const tabletArt = await box(page, ".art-stage"), tabletRow = await box(page, ".transport"), tabletRail = await box(page, ".dial-rail");
    assert(tabletArt.y >= 0 && tabletArt.y + tabletArt.height <= 1024 && tabletArt.width > 520, "tablet artwork grows and fits");
    assert(tabletRow.y + tabletRow.height <= 1024 && tabletRow.x + tabletRow.width <= tabletRail.x + 40, "tablet row is on screen");

    assert.deepEqual(errors, []);
    console.log("PASS: hidden control bar settings, presets, gestures, tap to play, Default and Divider placement, volume control and tablet fit.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
