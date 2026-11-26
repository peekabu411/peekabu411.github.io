// Gesture hints retire one at a time: once a gesture has been used three times, its hint stops
// showing on Now Playing. Choosing "Show text" for Gesture hints in Settings brings every hint back,
// and "Hide text" hides them all (.guide-copy).
//
// Fixed hints live in index.html and are placed by CSS: swipe to skip (skip), swipe to adjust
// (adjust), tap/2x/3x on the volume control (press), press for tabs (tabs), swipe to close the
// queue (queue). Hints for controls that move around (the Shuffle button, the control bar chip, the
// Divider mini player pill, the volume reveal arrow) are placed here, next to their control, on the
// first side that stays on screen and clear of every other control, text and hint. A hint that
// fits nowhere is left out rather than drawn over something.
(() => {
  const KEY = "turntable-gesture-hints-used";
  const RETIRE_AFTER = 3;
  const KINDS = ["skip", "adjust", "tabs", "press", "hold", "bar", "seek", "volume", "queue"];
  const remote = document.getElementById("remote");
  if (!remote) return;
  let counts = {};
  try { counts = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { counts = {}; }
  const retired = kind => (counts[kind] || 0) >= RETIRE_AFTER;

  function apply() {
    KINDS.forEach(kind => remote.classList.toggle(`hint-retired-${kind}`, retired(kind)));
    schedule();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch { /* private mode: hints simply stay */ }
  }

  window.turntableHints = Object.freeze({
    used(kind) {
      if (!KINDS.includes(kind) || retired(kind)) return;
      counts[kind] = (counts[kind] || 0) + 1;
      save();
      apply();
    },
    reset() { counts = {}; save(); apply(); },
    place: () => schedule()
  });

  document.querySelector('[data-guide-choice="shown"]')?.addEventListener("click", () => window.turntableHints.reset());

  // ---- Placed hints ------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const barState = () => (typeof window.getControlBarState === "function" ? window.getControlBarState() : remote.dataset.controlBar) || "shown";
  const pillActive = () => barState() === "hidden" && remote.dataset.playbackBar === "divider";
  const GAP = 5;
  const PLACED = [
    // Hold Shuffle opens the Shuffle / Smart Mix menu (smart-mix.js).
    { kind: "hold", text: () => "Hold for Smart Mix", anchor: () => $("shuffle"), sides: () => barState() === "hidden" ? ["below", "above"] : ["above", "below"] },
    // Divider while hidden: the mini player pill scrubs. Sits left of the chip, above the pill.
    { kind: "seek", text: () => "Drag to seek", anchor: () => $("control-bar-toggle"), when: pillActive, sides: () => ["left"] },
    // The chevron chip shows or hides the control bar (control-bar.js).
    { kind: "bar", text: () => barState() === "hidden" ? "Press for controls" : "Press to hide", anchor: () => $("control-bar-toggle"), sides: () => ["right", "left"] },
    // The arrow that brings a swiped-away volume control back.
    { kind: "volume", text: () => "Press for volume", anchor: () => $("side-control-reveal"), when: () => remote.classList.contains("side-controls-hidden"), sides: () => ["left", "below", "above"] }
  ];
  const layer = document.createElement("div");
  layer.className = "placed-hints";
  layer.setAttribute("aria-hidden", "true");
  PLACED.forEach(hint => {
    hint.el = document.createElement("p");
    hint.el.className = "placed-hint guide-copy";
    hint.el.dataset.hint = hint.kind;
    layer.append(hint.el);
  });
  remote.append(layer);

  function shown(el) {
    if (!el || !el.isConnected) return false;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < .05) return false;
    }
    return true;
  }
  // Text is measured by its glyphs, not its (often full-width) block.
  function boxOf(el) {
    if (/^(H1|H2|P|SPAN|SMALL|EM|B|STRONG)$/.test(el.tagName)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    }
    if (el.matches('input[type="range"]')) {
      // A slider is drawn as a thin line through the middle of a taller touch area.
      const box = el.getBoundingClientRect(), mid = (box.top + box.bottom) / 2;
      return { left: box.left, right: box.right, top: mid - 4, bottom: mid + 4 };
    }
    if (el.id === "bar-handle") return el.querySelector(".topbar-chevron")?.getBoundingClientRect() || el.getBoundingClientRect();
    return el.getBoundingClientRect();
  }
  const OBSTACLES = "#remote button, #remote a[href], #seek, .player-view .timeline.lifted, .player-view .timeline > div > span, #context, #title, #artist, .lyrics-panel, .album-art, .dial, .dial-readout, #message, .lyrics-track-marquee, .guide-copy:not(.placed-hint):not(.bar-button-label)";
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  function candidate(side, align, anchor, width, height) {
    const cx = (anchor.left + anchor.right) / 2, cy = (anchor.top + anchor.bottom) / 2;
    const at = (left, top) => ({ left, top, right: left + width, bottom: top + height });
    // Above and below try centred first, then lined up with the control's left or right edge.
    const x = { center: cx - width / 2, start: anchor.left, end: anchor.right - width }[align];
    if (side === "above") return at(x, anchor.top - GAP - height);
    if (side === "below") return at(x, anchor.bottom + GAP);
    if (side === "left") return at(anchor.left - GAP * 2 - width, cy - height / 2);
    return at(anchor.right + GAP * 2, cy - height / 2);
  }

  function place() {
    frame = 0;
    const onPlayer = remote.dataset.currentView === "player" && !remote.classList.contains("queue-open") && remote.dataset.guides !== "hidden";
    const view = remote.getBoundingClientRect();
    const obstacles = onPlayer ? [...document.querySelectorAll(OBSTACLES)].filter(el => !layer.contains(el) && shown(el)).map(el => ({ el, box: boxOf(el) })) : [];
    const taken = [];
    for (const hint of PLACED) {
      const anchorEl = hint.anchor();
      const wanted = onPlayer && !retired(hint.kind) && (!hint.when || hint.when()) && shown(anchorEl);
      if (!wanted) { hint.el.hidden = true; continue; }
      hint.el.textContent = hint.text();
      hint.el.hidden = false;
      hint.el.style.visibility = "hidden";
      const { width, height } = hint.el.getBoundingClientRect();
      const anchor = anchorEl.getBoundingClientRect();
      // Chips draw a small pill inside a larger invisible touch area; measure the pill.
      const blockerList = obstacles.filter(o => o.el !== anchorEl && !o.el.contains(anchorEl) && !anchorEl.contains(o.el));
      const blockers = blockerList.map(o => o.box).concat(taken, [anchor]);
      let spot = null;
      const tries = hint.sides().flatMap(side => side === "above" || side === "below" ? ["center", "start", "end"].map(align => [side, align]) : [[side, "center"]]);
      for (const [side, align] of tries) {
        const box = candidate(side, align, anchor, width, height);
        const inside = box.left >= view.left + 4 && box.right <= view.right - 4 && box.top >= view.top + 2 && box.bottom <= view.bottom - 2;
        const clear = { left: box.left - 2, top: box.top - 2, right: box.right + 2, bottom: box.bottom + 2 };
        if (inside && !blockers.some(b => hit(clear, b))) { spot = box; break; }
      }
      if (!spot) { hint.el.hidden = true; continue; }
      taken.push(spot);
      hint.el.style.left = `${spot.left - view.left}px`;
      hint.el.style.top = `${spot.top - view.top}px`;
      hint.el.style.visibility = "";
    }
  }
  let frame = 0, settle = [];
  function schedule() {
    if (!frame) frame = requestAnimationFrame(place);
    // Controls slide when the bar or volume control moves; place again once they settle.
    settle.forEach(clearTimeout);
    settle = [380, 800].map(delay => setTimeout(() => { if (!frame) frame = requestAnimationFrame(place); }, delay));
  }
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("turntable:control-bar", schedule);
  remote.addEventListener("transitionend", event => { if (!layer.contains(event.target)) schedule(); });
  new MutationObserver(schedule).observe(remote, { attributes: true, attributeFilter: ["class", "data-current-view", "data-playback-bar", "data-display", "data-control", "data-control-bar", "data-guides", "data-layout-resolved", "data-album"] });
  ["title", "artist", "context"].forEach(id => { const el = $(id); if (el) new MutationObserver(schedule).observe(el, { childList: true, characterData: true, subtree: true }); });
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(remote);
  apply();
})();
