// Checks that a release is stamped consistently (see tools/release.cjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { logVersions, pageAssets } = require("../tools/release.cjs");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html"), bridge = read("bridge.js"), sw = read("sw.js");
const version = logVersions(html)[0];

test("the update log never reuses a version number", () => {
  const versions = logVersions(html);
  assert.ok(versions.length > 0);
  assert.deepEqual(versions.filter((v, i) => versions.indexOf(v) !== i), []);
});

test("the Settings version button shows the newest log entry", () => {
  assert.match(html, new RegExp(`id="version-indicator"[^>]*aria-label="Turntable version ${version.replace(/\./g, "\\.")}"`));
  assert.match(html, new RegExp(`id="version-indicator"[\\s\\S]*?<b>ver\\(${version.replace(/\./g, "\\.")}\\)</b>`));
});

test("every stylesheet and script carries the current version tag and exists", () => {
  const assets = pageAssets(html, bridge).concat(["./bridge.js?v=" + version]);
  for (const asset of assets) {
    assert.equal(asset.split("?v=")[1], version, `${asset} should end with ?v=${version}`);
    assert.ok(fs.existsSync(path.join(root, asset.split("?")[0])), `${asset} exists`);
  }
});

test("the offline cache matches the page", () => {
  assert.match(sw, new RegExp(`const CACHE = "turntable-ios-${version.toLowerCase().replace(/\./g, "-")}";`));
  const cached = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
  for (const asset of pageAssets(html, bridge)) assert.ok(cached.includes(asset), `sw.js caches ${asset}`);
  for (const asset of cached) {
    const file = asset.split("?")[0];
    if (file !== "./") assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
  }
});
