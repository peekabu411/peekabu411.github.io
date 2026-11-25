#!/usr/bin/env node
// One command to stamp a release:  node tools/release.cjs I.10.1
//
// The version lives in one place per file, and this script keeps them in step:
// - every local stylesheet and script in index.html and bridge.js gets ?v=<version>,
//   so Safari and the Home Screen app fetch fresh copies after each publish;
// - sw.js gets a matching cache name and an offline file list rebuilt from the page;
// - the Settings version button shows the version.
// Write the newest update log entry (<b>ver(I.10.1)</b>) in index.html first: the script
// refuses to stamp a version the log does not describe, or one that was already used.
// tests/release.test.cjs checks that everything still agrees.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);

const VERSION_PATTERN = /^I\.\d+(\.\d+)*$/;
// Files the offline cache keeps besides the page's own stylesheets and scripts.
const EXTRA_CACHED = ["./", "./index.html", "./manifest.json", "./icons/turntable-remote-192.png", "./icons/apple-touch-icon.png"];

function logVersions(html) {
  return [...html.matchAll(/<li><b>ver\((I\.[\d.]+)\)<\/b>/g)].map(match => match[1]);
}

// Local CSS/JS references: ./name.css or ./name.js with an optional ?v= tag.
const ASSET_REF = /(["'])(\.\/[\w./-]+\.(?:css|js))(?:\?v=[^"']*)?\1/g;

function stamp(text, version) {
  return text.replace(ASSET_REF, (_, quote, file) => `${quote}${file}?v=${version}${quote}`);
}

function pageAssets(html, bridge) {
  const fromHtml = [...html.matchAll(/<(?:link rel="stylesheet" href|script src)="(\.\/[^"]+)"/g)].map(m => m[1]);
  const scripts = bridge.match(/const APP_SCRIPTS = \[([^\]]*)\]/);
  if (!scripts) throw new Error("bridge.js: APP_SCRIPTS list not found.");
  const fromBridge = [...scripts[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  return [...fromHtml, ...fromBridge];
}

function release(version) {
  if (!VERSION_PATTERN.test(version || "")) throw new Error(`Give a version like I.10.1 (got "${version || ""}").`);
  let html = read("index.html");
  const versions = logVersions(html);
  if (versions[0] !== version) throw new Error(`Add the update log entry <b>ver(${version})</b> at the top of the log in index.html first (newest entry is ver(${versions[0]})).`);
  if (versions.indexOf(version, 1) !== -1) throw new Error(`ver(${version}) already appears further down the update log. Every publish needs a new number.`);

  html = stamp(html, version)
    .replace(/(id="version-indicator"[^>]*aria-label=")[^"]*(")/, `$1Turntable version ${version}$2`)
    .replace(/(id="version-indicator"[\s\S]*?<b>)ver\([^)]*\)(<\/b>)/, `$1ver(${version})$2`);
  const bridge = stamp(read("bridge.js"), version);

  const assets = [...new Set([...EXTRA_CACHED.slice(0, 2), ...pageAssets(html, bridge), ...EXTRA_CACHED.slice(2)])];
  for (const asset of assets) {
    const file = asset.split("?")[0];
    if (file !== "./" && !fs.existsSync(path.join(root, file))) throw new Error(`${file} is listed for loading but does not exist.`);
  }
  const cacheName = `turntable-ios-${version.toLowerCase().replace(/\./g, "-")}`;
  const assetList = `const ASSETS = [\n${assets.map(a => `  ${JSON.stringify(a)}`).join(",\n")}\n];`;
  let sw = read("sw.js")
    .replace(/const CACHE = "[^"]*";/, `const CACHE = ${JSON.stringify(cacheName)};`)
    .replace(/const ASSETS = \[[\s\S]*?\];/, assetList);

  write("index.html", html);
  write("bridge.js", bridge);
  write("sw.js", sw);
  console.log(`Stamped ${version}: ${assets.length} cached files, cache "${cacheName}".`);
}

if (require.main === module) {
  try { release(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { logVersions, pageAssets, VERSION_PATTERN };
