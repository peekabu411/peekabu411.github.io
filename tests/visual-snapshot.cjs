// Visual snapshot check for refactors that must not change how the app looks.
// Usage:
//   node tests/visual-snapshot.cjs capture <appRoot> <outDir>
//   node tests/visual-snapshot.cjs compare <beforeDir> <afterDir> [diffDir]
// Capture serves <appRoot> locally, answers Spotify/LRCLIB with fixtures, freezes the clock
// and animations, and screenshots a fixed matrix of devices x styles x screens.
// Compare reports every snapshot whose pixels differ and writes highlighted diffs.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const DEVICES = {
  "iphone-13-pro": { viewport: { width: 844, height: 390 } },
  "iphone-se": { viewport: { width: 667, height: 375 } },
  "iphone-pro-max": { viewport: { width: 932, height: 430 } },
  "ipad-air": { viewport: { width: 1180, height: 820 } },
  "ipad-pro": { viewport: { width: 1366, height: 1024 } }
};
const STYLES = {
  "vinyl-dial-default": { album: "vinyl", control: "dial", display: "info", bar: "default", controlBar: "shown" },
  "square-bar-divider": { album: "square", control: "bar", display: "info", bar: "divider", controlBar: "shown", barBg: "translucent" },
  "vinyl-lyrics-divider": { album: "vinyl", control: "dial", display: "lyrics", bar: "divider", controlBar: "shown", lyricsBg: "solid" },
  "square-dial-hidden-bar": { album: "square", control: "dial", display: "info", bar: "default", controlBar: "hidden" },
  "square-bar-divider-hidden": { album: "square", control: "bar", display: "info", bar: "divider", controlBar: "hidden" }
};
// [screen, style] pairs; null style = default style.
const SCREENS = [
  ...Object.keys(STYLES).map(style => ["player", style]),
  ["queue", "vinyl-dial-default"],
  ["tabs-open", "vinyl-dial-default"],
  ["playlists", null], ["devices", null], ["settings", null], ["settings-bottom", null],
  ["setup", null]
];

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serve(root) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const target = path.resolve(root, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (error, data) => {
      res.writeHead(error ? 404 : 200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
      res.end(error ? "Not found" : data);
    });
  });
  return new Promise(resolve => server.listen(Number(process.env.SNAPSHOT_PORT) || 47821, "127.0.0.1", () => resolve(server)));
}

const art = (a, b, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="640" height="640" fill="url(#g)"/><circle cx="420" cy="230" r="120" fill="#f4c26b" opacity=".85"/></svg>`;
const arts = { a: ["#e2553a", "#7b2d6b", "#1d2a5c"], b: ["#2a9d8f", "#264653", "#0b132b"], c: ["#f4a261", "#e76f51", "#3d1f2b"], d: ["#8ecae6", "#219ebc", "#023047"] };
const T = (name, artist, img) => ({ type: "track", id: name.replace(/\W/g, ""), uri: "spotify:track:" + name.replace(/\W/g, ""), name, duration_ms: 214000, artists: [{ name: artist }], album: { name: "Album", images: [{ url: "https://i.scdn.co/image/" + img }] }, external_urls: { spotify: "https://open.spotify.com/track/x" } });
const track = T("Midnight Static", "The Night Owls", "a");
const queue = [T("Glass Harbor", "Lumen Bay", "b"), T("Paper Moons", "Ivy Ferris", "c"), T("Slow Arcade", "The Night Owls", "d")];
const device = { id: "d1", name: "Living room", type: "Speaker", is_active: true, supports_volume: true, volume_percent: 55 };
const devices = [device, { id: "d2", name: "Office laptop", type: "Computer", is_active: false, supports_volume: true, volume_percent: 30 }];
const playlists = [1, 2, 3, 4, 5].map(i => ({ id: "p" + i, uri: "spotify:playlist:p" + i, name: ["Morning Drive", "Focus", "Late Night", "Road Trip", "Rainy Day"][i - 1], description: "", images: [{ url: "https://i.scdn.co/image/" + "abcd"[i % 4] }], owner: { display_name: "You" }, items: { total: 20 * i } }));
const LYRICS = "[00:10.00]First line of the song\n[00:50.00]Second line rolls in\n[01:20.00]Third line is current\n[01:40.00]Fourth line waits";

async function fixtures(context) {
  await context.route("https://**/*", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { "Access-Control-Allow-Origin": "*" };
    if (url.hostname === "accounts.spotify.com") return route.fulfill({ json: { access_token: "a", refresh_token: "r", expires_in: 3600 }, headers });
    if (url.hostname === "api.spotify.com") {
      if (request.method() !== "GET") return route.fulfill({ status: 204, headers });
      const playback = { item: track, is_playing: true, progress_ms: 83000, device, context: { type: "playlist", uri: "spotify:playlist:p1" }, shuffle_state: true, repeat_state: "off", actions: { disallows: {} } };
      const p = url.pathname;
      const json = p === "/v1/me/library/contains" ? [true]
        : p.endsWith("/devices") ? { devices }
        : p.endsWith("/queue") ? { currently_playing: track, queue }
        : p === "/v1/me/playlists" ? { items: playlists }
        : p.endsWith("/tracks") ? { total: 120, items: [{ track }] }
        : p === "/v1/me" ? { id: "u", country: "US" }
        : playback;
      return route.fulfill({ json, headers });
    }
    if (url.hostname === "lrclib.net") return route.fulfill({ json: { syncedLyrics: LYRICS, plainLyrics: "x", instrumental: false }, headers });
    if (url.hostname === "i.scdn.co") return route.fulfill({ contentType: "image/svg+xml", body: art(...(arts[url.pathname.split("/").pop()] || arts.a)), headers });
    return route.fulfill({ contentType: "text/css", body: "", headers });
  });
}

const FREEZE = `*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}`;

async function capture(root, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve(path.resolve(root));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let count = 0;
  try {
    for (const [deviceName, device] of Object.entries(DEVICES)) {
      for (const [screen, styleName] of SCREENS) {
        const style = STYLES[styleName || "vinyl-dial-default"];
        const context = await browser.newContext({ ...device, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        context.setDefaultTimeout(15000);
        await fixtures(context);
        await context.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
        await context.addInitScript(([screen, s]) => {
          if (sessionStorage.getItem("snapshot-init")) return;
          sessionStorage.setItem("snapshot-init", "1");
          localStorage.clear();
          if (screen === "setup") return;
          localStorage.setItem("turntable-ios-oauth", JSON.stringify({ client_id: "c", access_token: "a", refresh_token: "r", expires_at: Date.parse("2026-01-01T13:00:00Z"), scope: "user-library-read user-library-modify user-read-private" }));
          localStorage.setItem("turntable-session", "github-pages");
          localStorage.setItem("turntable-now-playing-guide-v1", "completed");
          localStorage.setItem("turntable-now-playing-guide-v2", "completed");
          sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
          const set = (k, v) => v && localStorage.setItem("turntable-" + k, v);
          set("album-style", s.album); set("control-style", s.control); set("display-style", s.display);
          set("playback-bar-style", s.bar); set("control-bar", s.controlBar);
          set("control-bar-background", s.barBg); set("lyrics-background", s.lyricsBg);
        }, [screen, style]);
        const page = await context.newPage();
        await page.goto(origin);
        if (screen !== "setup") await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Midnight Static");
        await context.clock.runFor(2500);
        await page.addStyleTag({ content: FREEZE });
        await page.evaluate(async screen => {
          const remote = document.getElementById("remote");
          const open = view => { remote?.classList.remove("topbar-hidden"); document.querySelector(`[data-view="${view}"]`)?.click(); };
          if (screen === "queue") document.getElementById("queue-toggle")?.click();
          if (screen === "tabs-open") remote?.classList.remove("topbar-hidden");
          if (["playlists", "devices", "settings", "settings-bottom"].includes(screen)) open(screen.replace("-bottom", ""));
        }, screen);
        await context.clock.runFor(1500);
        if (screen === "settings-bottom") await page.evaluate(() => { const v = document.querySelector('[data-panel="settings"]'); const s = [v, ...v.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible"); if (s) s.scrollTop = s.scrollHeight; });
        await page.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; }));
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(outDir, `${deviceName}--${screen}${styleName && screen === "player" ? "--" + styleName : ""}.png`) });
        count++;
        await context.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  console.log(`Captured ${count} snapshots in ${outDir}`);
}

async function compare(beforeDir, afterDir, diffDir) {
  const names = [...new Set([...fs.readdirSync(beforeDir), ...fs.readdirSync(afterDir)])].filter(n => n.endsWith(".png")).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  if (diffDir) fs.mkdirSync(diffDir, { recursive: true });
  for (const name of names) {
    const a = path.join(beforeDir, name), b = path.join(afterDir, name);
    if (!fs.existsSync(a) || !fs.existsSync(b)) { failures.push(`${name}: missing in ${fs.existsSync(a) ? "after" : "before"}`); continue; }
    const result = await page.evaluate(async ([a, b]) => {
      const load = src => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = "data:image/png;base64," + src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: true };
      const w = ia.width, h = ia.height, c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, w, h).data;
      x.drawImage(ib, 0, 0); const img = x.getImageData(0, 0, w, h), db = img.data;
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 24) { diff++; db[i] = 255; db[i + 1] = 0; db[i + 2] = 200; } else { db[i] = db[i] * .35; db[i + 1] = db[i + 1] * .35; db[i + 2] = db[i + 2] * .35; }
      }
      x.putImageData(img, 0, 0);
      return { diff, total: w * h, png: diff ? c.toDataURL("image/png").split(",")[1] : null };
    }, [fs.readFileSync(a).toString("base64"), fs.readFileSync(b).toString("base64")]);
    if (result.size) { failures.push(`${name}: size changed`); continue; }
    if (result.diff > (Number(process.env.SNAPSHOT_TOLERANCE) || 20)) {
      failures.push(`${name}: ${result.diff} pixels differ (${(100 * result.diff / result.total).toFixed(2)}%)`);
      if (diffDir) fs.writeFileSync(path.join(diffDir, name), Buffer.from(result.png, "base64"));
    }
  }
  await browser.close();
  console.log(`${names.length - failures.length}/${names.length} snapshots identical`);
  failures.forEach(f => console.log("  DIFF " + f));
  process.exitCode = failures.length ? 1 : 0;
}

const [mode, ...args] = process.argv.slice(2);
(mode === "capture" ? capture(args[0], args[1]) : mode === "compare" ? compare(args[0], args[1], args[2]) : Promise.reject(new Error("Usage: capture <root> <out> | compare <before> <after> [diff]")))
  .catch(error => { console.error(error); process.exitCode = 1; });
