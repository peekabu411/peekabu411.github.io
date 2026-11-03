const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../viewport-resume.js"), "utf8");
function harness({ userAgent = "iPhone", standalone = true, mediaStandalone = false, height = 390, hidden = false, visual = true } = {}) {
  let now = 0, nextId = 0, editing = false, writes = 0, layoutEvents = 0;
  const jobs = new Map(), properties = new Map(), listeners = { window: {}, document: {}, visual: {} };
  const add = target => (type, callback) => (listeners[target][type] ||= []).push(callback);
  const emit = (target, type, event = {}) => (listeners[target][type] || []).forEach(callback => callback(event));
  const schedule = (callback, delay) => { const id = ++nextId; jobs.set(id, { at: now + delay, callback }); return id; };
  const activeElement = { matches: () => editing };
  const root = { dataset: {}, style: { setProperty(key, value) { properties.set(key, value); writes++; } } };
  const player = { hidden: false };
  const viewport = visual ? { height, width: 844, scale: 1, offsetTop: 0, addEventListener: add("visual") } : null;
  const document = { hidden, documentElement: root, activeElement, getElementById: () => player, addEventListener: add("document") };
  const window = { innerWidth: 844, innerHeight: height, visualViewport: viewport, matchMedia: () => ({ matches: mediaStandalone }), addEventListener: add("window"), dispatchEvent: event => { if (event.type === "turntable:viewport-layout") layoutEvents++; } };
  const context = { navigator: { userAgent, standalone }, document, window, Number, Math, Set, CustomEvent: class { constructor(type) { this.type = type; } }, requestAnimationFrame: callback => schedule(callback, 16), cancelAnimationFrame: id => jobs.delete(id), setTimeout: schedule, clearTimeout: id => jobs.delete(id), fetch: () => { throw new Error("Layout recovery must not make network requests"); } };
  vm.runInNewContext(source, context);
  function advance(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const pending = [...jobs.entries()].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      const [id, job] = pending; now = job.at; jobs.delete(id); job.callback();
    }
    now = end;
  }
  return { context, root, viewport, window, document, properties, jobs, listeners, advance, emit, edit: value => { editing = value; }, get writes() { return writes; }, get layoutEvents() { return layoutEvents; } };
}
test("cold startup corrects a height that settles late without a resize event", () => {
  const h = harness({ height: 336 });
  h.advance(20);
  assert.equal(h.properties.get("--turntable-viewport-height"), "336px");
  h.advance(900);
  h.window.innerHeight = 390; h.viewport.height = 390;
  h.advance(700);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
  assert.equal(h.root.dataset.standaloneViewport, "iphone");
  h.advance(4000);
  assert.equal(h.jobs.size, 0);
  const writes = h.writes;
  h.advance(86400000);
  assert.equal(h.writes, writes, "no ongoing polling");
});
test("hiding cancels pending work and reopening hours later starts a fresh bounded check", () => {
  const h = harness(); h.advance(20);
  h.document.hidden = true; h.emit("document", "visibilitychange");
  assert.equal(h.jobs.size, 0);
  h.advance(3600000);
  h.window.innerHeight = 844; h.window.innerWidth = 390;
  h.viewport.height = 844; h.viewport.width = 390;
  h.document.hidden = false; h.emit("document", "visibilitychange"); h.advance(20);
  assert.equal(h.properties.get("--turntable-viewport-height"), "844px");
  h.advance(4000); assert.equal(h.jobs.size, 0);
});
test("pageshow restores frozen pages and repeated launch events do not accumulate timers", () => {
  const h = harness({ hidden: true }); assert.equal(h.jobs.size, 0);
  h.document.hidden = false;
  for (let i = 0; i < 10; i++) { h.emit("window", "pageshow", { persisted: true }); h.emit("window", "focus"); }
  assert(h.jobs.size <= 6);
  h.advance(4000);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
  assert.equal(h.layoutEvents, 1, "unchanged size does not repeatedly recalculate the app");
  assert.equal(h.jobs.size, 0);
});
test("ordinary Safari, Android, iPad, and desktop layouts remain untouched", () => {
  for (const options of [{ standalone: false }, { userAgent: "Android" }, { userAgent: "iPad" }, { userAgent: "Windows NT" }]) {
    const h = harness(options); h.advance(5000);
    assert.equal(h.properties.size, 0); assert.equal(h.jobs.size, 0);
    assert(Object.values(h.listeners).every(target => Object.keys(target).length === 0));
  }
});
test("editing and pinch zoom never save collapsed or scaled viewport heights", () => {
  const h = harness(); h.advance(20);
  h.edit(true); h.viewport.height = 180; h.window.innerHeight = 180;
  h.emit("visual", "resize"); h.advance(4000);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
  h.edit(false); h.window.innerHeight = 390; h.viewport.height = 390;
  h.emit("document", "focusout", { target: { matches: () => true } }); h.advance(20);
  h.viewport.scale = 2; h.viewport.height = 195; h.window.innerHeight = 195;
  h.emit("visual", "resize"); h.advance(4000);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
});
test("initial hidden player and setup inputs are not resized; visual viewport is optional", () => {
  const h = harness({ visual: false }); h.context.document.getElementById().hidden = true;
  h.advance(4000); assert.equal(h.properties.size, 0);
  h.context.document.getElementById().hidden = false;
  h.emit("window", "pageshow"); h.advance(20);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
});
test("pre-rotation visual sizes cannot enlarge the new landscape window", () => {
  const h = harness(); h.viewport.width = 390; h.viewport.height = 844;
  h.advance(20);
  assert.equal(h.properties.get("--turntable-viewport-height"), "390px");
});
