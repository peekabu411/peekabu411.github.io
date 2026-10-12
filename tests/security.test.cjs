const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bridge.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");
const auth = { client_id: "dummy-client", access_token: "dummy-access", refresh_token: "dummy-refresh", expires_at: Date.now() + 600000 };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ url = "https://peekabu411.github.io/", saved = {}, pending = {}, fetcher } = {}) {
  const location = new URL(url), requests = [], loaded = [], handlers = {};
  location.reload = () => { location.reloaded = true; };
  location.assign = value => { location.assigned = value; };
  const body = { innerHTML: "", children: [], replaceChildren(...children) { this.children = children; this.innerHTML = ""; }, append(script) { loaded.push(script.src); script.onload(); } };
  const context = { URL, URLSearchParams, Response, TextEncoder, Uint8Array, Date, JSON, Number, Math, Promise, Error, Object, String, setTimeout, crypto: require("node:crypto").webcrypto, btoa: value => Buffer.from(value, "binary").toString("base64"), localStorage: storage(saved), sessionStorage: storage(pending), location, history: { replaceState(_state, _title, value) { location.href = value; } }, document: { body, createElement: () => ({}), getElementById: () => null, querySelector: () => ({}) }, CustomEvent: class {}, window: { addEventListener: (name, callback) => { handlers[name] = callback; }, dispatchEvent: () => {}, fetch: async (url, options) => { requests.push({ url: String(url), options }); return fetcher ? fetcher(url, options) : new Response("{}", { status: 200 }); } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, requests, loaded, handlers, body };
}
test("all Spotify data/action routes reject forged UI sessions without OAuth", async () => {
  const h = harness({ saved: { "turntable-session": "forged" } });
  await flush();
  for (const [url, body] of [["/api/status", {}], ["/api/devices", {}], ["/api/queue", {}], ["/api/playlists", {}], ["/api/player/play", {}], ["/api/player/playlist", { context_uri: "spotify:playlist:dummy" }], ["/api/player/liked-songs", {}], ["/api/player/skip-count", { count: 1 }], ["/api/settings", { volume_percent: 50 }]]) {
    assert.equal((await h.context.window.fetch(url, { body: JSON.stringify(body) })).status, 401, url);
  }
  assert.equal(h.requests.length, 0);
});
test("the actual Unpair handler clears tokens, PKCE, and playback but preserves appearance", async () => {
  const h = harness({ saved: { "turntable-session": "github-pages", "turntable-ios-oauth": JSON.stringify(auth), "turntable-last-playback": "private playback", "turntable-album-style": "vinyl" }, pending: { "tt.state": "state", "tt.verifier": "verifier" } });
  const button = {};
  h.context.$ = () => button;
  h.context.physicalFeedback = () => {};
  vm.runInContext(app.split("\n").find(line => line.startsWith('$("unpair-phone").onclick')), h.context);
  button.onclick();
  for (const key of ["turntable-ios-oauth", "turntable-session", "turntable-last-playback"]) assert.equal(h.context.localStorage.getItem(key), null);
  assert.equal(h.context.sessionStorage.getItem("tt.state"), null);
  assert.equal(h.context.sessionStorage.getItem("tt.verifier"), null);
  assert.equal(h.context.localStorage.getItem("turntable-album-style"), "vinyl");
  assert.equal((await h.context.window.fetch("/api/status")).status, 401);
  assert.equal(h.requests.length, 0);
});
test("parallel expired-token calls share one refresh", async () => {
  let refreshes = 0;
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify({ ...auth, expires_at: 0 }) }, fetcher: async url => {
    if (String(url).includes("/api/token")) { refreshes++; await flush(); return Response.json({ access_token: "renewed", expires_in: 3600 }); }
    return Response.json({});
  } });
  const results = await Promise.all(["/api/status", "/api/devices", "/api/queue"].map(url => h.context.window.fetch(url)));
  assert(results.every(result => result.ok));
  assert.equal(refreshes, 1);
  assert.equal(JSON.parse(h.context.localStorage.getItem("turntable-ios-oauth")).refresh_token, "dummy-refresh");
});
test("unpairing between token lookup and request dispatch prevents the API request", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(auth) } });
  const request = h.context.window.fetch("/api/status");
  h.context.window.turntableAuth.disconnect();
  assert.equal((await request).status, 401);
  assert.equal(h.requests.length, 0);
});
test("connecting recovers corrupt OAuth data without clearing the newly generated PKCE state", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": "not JSON" } });
  const result = await h.context.window.fetch("/api/pair", { body: JSON.stringify({ pin: "dummy-client" }) });
  assert.equal(result.status, 200);
  assert(h.context.sessionStorage.getItem("tt.verifier"));
  const redirect = new URL(h.context.location.assigned);
  assert.equal(redirect.searchParams.get("state"), h.context.sessionStorage.getItem("tt.state"));
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
});
test("a late token refresh cannot restore an unpaired connection", async () => {
  let release;
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify({ ...auth, expires_at: 0 }) }, fetcher: () => new Promise(resolve => { release = resolve; }) });
  const request = h.context.window.fetch("/api/status");
  h.context.window.turntableAuth.disconnect();
  release(Response.json({ access_token: "late-token", expires_in: 3600 }));
  assert.equal((await request).status, 401);
  assert.equal(h.context.localStorage.getItem("turntable-ios-oauth"), null);
  assert.equal(h.requests.length, 1);
});
test("removing credentials in another tab also disconnects this tab", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(auth), "turntable-session": "github-pages" } });
  h.handlers.storage({ key: "turntable-ios-oauth", newValue: null });
  assert.equal(h.context.localStorage.getItem("turntable-session"), null);
  assert.equal(h.context.location.reloaded, true);
});
test("successful callback consumes state and strips credentials before exchange", async () => {
  const h = harness({ url: "https://peekabu411.github.io/?code=dummy-code&state=expected&keep=1#player", saved: { "turntable-ios-oauth": JSON.stringify({ client_id: "dummy-client" }) }, pending: { "tt.state": "expected", "tt.verifier": "verifier" }, fetcher: async (_url, options) => {
    await flush();
    assert.equal(h.context.location.search, "?keep=1");
    assert.equal(h.context.sessionStorage.getItem("tt.verifier"), null);
    assert.equal(options.cache, "no-store");
    return Response.json({ access_token: "dummy-access", refresh_token: "dummy-refresh", expires_in: 3600 });
  } });
  await flush();
  assert.equal(h.context.location.search, "?keep=1");
  assert.equal(h.context.location.hash, "#player");
  assert.equal(h.context.localStorage.getItem("turntable-session"), "github-pages");
  assert(h.body.innerHTML.includes("Connected."));
  assert.equal(h.loaded.length, 0, "callback must not load the normal app over the return card");
});
test("untrusted OAuth error is literal text, not HTML", async () => {
  const message = '<img src=x onerror="alert(1)">';
  const h = harness({ url: "https://peekabu411.github.io/?code=dummy-code&state=expected", pending: { "tt.state": "expected", "tt.verifier": "verifier" }, fetcher: () => Response.json({ error_description: message }, { status: 400 }) });
  await flush();
  assert.equal(h.body.innerHTML, "");
  assert.equal(h.body.children[0].textContent, message);
  assert.equal(h.context.location.search, "");
  assert.equal(h.context.sessionStorage.getItem("tt.state"), null);
});
test("invalid state and denied authorization clear callback details without token exchange", async () => {
  for (const query of ["code=dummy&state=wrong", "error=access_denied&state=expected"]) {
    const h = harness({ url: `https://peekabu411.github.io/?${query}`, pending: { "tt.state": "expected", "tt.verifier": "verifier" } });
    await flush();
    assert.equal(h.requests.length, 0);
    assert.equal(h.context.location.search, "");
    assert.equal(h.context.sessionStorage.getItem("tt.state"), null);
    assert.equal(h.loaded.length, 0);
  }
});
test("corrupt saved OAuth data fails closed without rendering parser details", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": "not JSON", "turntable-session": "github-pages" } });
  assert.equal((await h.context.window.fetch("/api/status")).status, 401);
  assert.equal(h.context.localStorage.getItem("turntable-ios-oauth"), null);
  assert.equal(h.requests.length, 0);
});
test("cross-origin /api URLs are not intercepted as local routes", async () => {
  const h = harness();
  await h.context.window.fetch("https://example.org/api/status");
  assert.equal(h.requests[0].url, "https://example.org/api/status");
  assert.equal(h.requests[0].options, undefined);
});
function workerHarness() {
  const handlers = {}, stored = [], deleted = [], outbound = [];
  const cache = { addAll: async () => {}, put: async request => stored.push(request.url), keys: async () => [{ url: "https://peekabu411.github.io/?code=stale" }], delete: async request => deleted.push(request.url) };
  const context = { URL, Promise, location: { origin: "https://peekabu411.github.io" }, caches: { open: async () => cache, keys: async () => ["turntable-ios-old", "turntable-ios-i98-song-likes", "another-app-cache"], delete: async key => deleted.push(key), match: async () => new Response("offline") }, fetch: async (request, options) => { outbound.push({ request, options }); return new Response("asset", { status: 200 }); }, self: { addEventListener: (name, callback) => { handlers[name] = callback; }, clients: { claim: async () => {} }, skipWaiting: async () => {} } };
  vm.createContext(context); vm.runInContext(worker, context);
  return { handlers, stored, deleted, outbound };
}
test("worker never caches OAuth callbacks or API requests", async () => {
  const h = workerHarness();
  for (const suffix of ["/?code=secret&state=secret", "/?error=access_denied", "/?state=secret", "/api/status"]) {
    let result;
    h.handlers.fetch({ request: { method: "GET", url: `https://peekabu411.github.io${suffix}` }, respondWith: value => { result = value; } });
    await result;
    assert.equal(h.outbound.at(-1).options.cache, "no-store");
  }
  assert.equal(h.stored.length, 0);
});
test("worker clears old/sensitive Turntable caches but preserves other apps", async () => {
  const h = workerHarness();
  let completed;
  h.handlers.activate({ waitUntil: value => { completed = value; } });
  await completed;
  assert(h.deleted.includes("turntable-ios-old"));
  assert(h.deleted.includes("https://peekabu411.github.io/?code=stale"));
  assert(!h.deleted.includes("another-app-cache"));
});
test("normal app assets remain cacheable", async () => {
  const h = workerHarness();
  let result;
  const waits = [];
  h.handlers.fetch({ request: { method: "GET", url: "https://peekabu411.github.io/app.js" }, respondWith: value => { result = value; }, waitUntil: value => waits.push(value) });
  await result; await Promise.all(waits);
  assert(h.stored.includes("https://peekabu411.github.io/app.js"));
});

const songUri = "spotify:track:4iV5W9uYEdYUVa79Axb7Rh";
const libraryAuth = { ...auth, scope: "user-library-read user-library-modify" };
test("library reads authenticate, cache, and save/remove use the documented library API", async () => {
  let liked = false;
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(libraryAuth) }, fetcher: (_url, options) => {
    if (options.method) { liked = options.method === "PUT"; return new Response(null, { status: 200 }); }
    return Response.json([liked]);
  } });
  const read = () => h.context.window.fetch(`/api/library/track?uri=${encodeURIComponent(songUri)}`);
  assert.equal((await (await read()).json()).saved, false);
  await read();
  assert.equal(h.requests.length, 1);
  for (const saved of [true, false]) {
    const result = await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved }) });
    assert.equal((await result.json()).saved, saved);
    assert.equal(h.requests.at(-1).options.method, saved ? "PUT" : "DELETE");
    assert.equal(new URL(h.requests.at(-1).url).pathname, "/v1/me/library");
    assert.equal(new URL(h.requests.at(-1).url).searchParams.get("uris"), songUri);
    assert.equal((await (await read()).json()).saved, saved);
  }
  assert.equal(h.requests.length, 3);
  h.context.window.turntableAuth.disconnect();
  assert.equal((await read()).status, 401);
});
test("library rejects invalid tracks, unsupported methods, and unauthenticated writes", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(libraryAuth) } });
  for (const uri of ["spotify:episode:4iV5W9uYEdYUVa79Axb7Rh", "spotify:local:artist:track", "https://example.org", "spotify:track:bad"]) {
    assert.equal((await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri, saved: true }) })).status, 400);
  }
  assert.equal((await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved: "true" }) })).status, 400);
  assert.equal((await h.context.window.fetch("/api/library/track", { method: "DELETE" })).status, 405);
  assert.equal(h.requests.length, 0);
  const unauth = harness();
  assert.equal((await unauth.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved: true }) })).status, 401);
});
test("older read-only connections can check likes but must reconnect before writes", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify({ ...auth, scope: "user-library-read" }) }, fetcher: () => Response.json([true]) });
  const result = await h.context.window.fetch(`/api/library/track?uri=${encodeURIComponent(songUri)}`);
  assert.equal((await result.json()).needs_reconnect, true);
  const write = await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved: false }) });
  assert.equal(write.status, 403);
  assert.equal((await write.json()).needs_reconnect, true);
  assert.equal(h.requests.length, 1);
  await h.context.window.fetch("/api/reauthorize", { method: "POST" });
  assert(new URL(h.context.location.assigned).searchParams.get("scope").split(" ").includes("user-library-modify"));
});
test("failed writes retain confirmed status and rate limit retry delay", async () => {
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(libraryAuth) }, fetcher: (_url, options) => options.method ? Response.json({ error: { message: "Too many requests" } }, { status: 429, headers: { "retry-after": "45" } }) : Response.json([false]) });
  const read = () => h.context.window.fetch(`/api/library/track?uri=${encodeURIComponent(songUri)}`);
  await read();
  const write = await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved: true }) });
  assert.equal(write.status, 429);
  assert.equal((await write.json()).retry_after, 45);
  assert.equal((await (await read()).json()).saved, false);
});
test("a delayed pre-save read cannot overwrite a successful save", async () => {
  let release;
  const h = harness({ saved: { "turntable-ios-oauth": JSON.stringify(libraryAuth) }, fetcher: (_url, options) => options.method ? new Response(null, { status: 200 }) : new Promise(resolve => { release = resolve; }) });
  const read = h.context.window.fetch(`/api/library/track?uri=${encodeURIComponent(songUri)}`);
  await flush();
  await h.context.window.fetch("/api/library/track", { method: "PUT", body: JSON.stringify({ uri: songUri, saved: true }) });
  release(Response.json([false]));
  assert.equal((await (await read).json()).saved, true);
});
