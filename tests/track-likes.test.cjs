const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../track-likes.js"), "utf8");
const first = { type: "track", uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh" };
const second = { type: "track", uri: "spotify:track:08PQgCL2WTNuMKAnbKC9jV" };
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(track = first) {
  const nodes = {}, requests = [], errors = [];
  for (const id of ["track-like", "library-permission", "library-permission-connect", "library-permission-dismiss"]) nodes[id] = { disabled: false, hidden: true, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener() {}, focus() {} };
  const context = { document: { getElementById: id => nodes[id] }, window: {}, playback: { item: track }, session: "test", playlistsLoaded: true, physicalFeedback() {}, setMessage() {}, showError: error => errors.push(error), api: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, requests, errors, button: nodes["track-like"], permission: nodes["library-permission"], sync: context.window.turntableLikes.syncTrack, click: () => nodes["track-like"].onclick({ stopPropagation() {} }) };
}
test("same-track polls make one read and heart clicks save/remove without duplicate writes", async () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.sync(first);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ saved: false }); await flush();
  const save = h.click(); await h.click();
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(h.requests[1].options.body).saved, true);
  h.requests[1].resolve({ saved: true }); await save;
  assert.equal(h.button.attributes["aria-pressed"], "true");
  assert.equal(h.context.playlistsLoaded, false);
  const remove = h.click();
  assert.equal(JSON.parse(h.requests[2].options.body).saved, false);
  h.requests[2].resolve({ saved: false }); await remove;
  assert.equal(h.button.attributes["aria-pressed"], "false");
});
test("old reads and writes cannot paint a different track's heart", async () => {
  const h = harness(); h.sync(second);
  h.requests[1].resolve({ saved: true }); await flush();
  h.requests[0].resolve({ saved: false }); await flush();
  assert.equal(h.button.attributes["aria-pressed"], "true");
  const remove = h.click(); h.sync(first);
  h.requests[3].resolve({ saved: true }); await flush();
  h.requests[2].resolve({ saved: false }); await remove;
  assert.equal(h.button.attributes["aria-pressed"], "true");
});
test("failed saves preserve confirmed heart state and missing scope opens permission dialog", async () => {
  const h = harness(); h.requests[0].resolve({ saved: false }); await flush();
  const save = h.click(); h.requests[1].reject(new Error("Offline")); await save;
  assert.equal(h.button.attributes["aria-pressed"], "false");
  assert.equal(h.button.disabled, false);
  const denied = h.click(); h.requests[2].reject(Object.assign(new Error("Permission required"), { needsReconnect: true })); await denied;
  assert.equal(h.permission.hidden, false);
  assert.equal(h.button.attributes["aria-pressed"], "false");
});
test("podcasts, local files and empty playback never make library calls", () => {
  for (const track of [null, { ...first, is_local: true }, { ...first, type: "episode" }, { uri: "spotify:local:a:b" }]) {
    const h = harness(track);
    assert.equal(h.requests.length, 0);
    assert.equal(h.button.disabled, true);
  }
});
