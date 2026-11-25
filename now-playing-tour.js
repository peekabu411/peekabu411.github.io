// Now Playing spotlight tour: dims the real player, outlines one control at a time
// and puts a short card beside it. Steps follow the user's current styles (square or
// vinyl, dial or bar, Default or Divider, control bar shown or hidden) and skip any
// control that is not on screen. Started from the welcome card or from Settings.
(() => {
  const remoteShell = document.getElementById("remote");
  if (!remoteShell) return;
  const $ = (selector) => document.querySelector(selector);
  const GAP = 10;
  const EDGE = 12;

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
  };
  const isHidden = () => remoteShell.dataset.controlBar === "hidden";
  const isDivider = () => remoteShell.dataset.playbackBar === "divider";
  const isBar = () => remoteShell.dataset.control === "bar";
  const isVinyl = () => remoteShell.dataset.album === "vinyl";

  const steps = [
    {
      target: () => [$("#album-card"), $(".player-view .swipe-hint")],
      kicker: "NOW PLAYING",
      title: () => isHidden() ? "Swipe to skip. Tap to play." : "Swipe the artwork to skip",
      copy: () => `Swipe your ${isVinyl() ? "record" : "album art"} left for the next song or right to go back.${isHidden() ? " A quick tap plays or pauses." : ""}`,
      gesture: () => ({ kind: "swipe", el: $("#album-card"), dx: -1 })
    },
    {
      target: () => $("#track-like"),
      kicker: "LIKED SONGS",
      title: () => "Save the song you hear",
      copy: () => "Tap the heart to add this song to your Liked Songs, and tap again to remove it. Green means it is saved.",
      gesture: () => ({ kind: "tap", el: $("#track-like") })
    },
    {
      target: () => $(".player-view .timeline"),
      kicker: "TIMELINE",
      title: () => "Drag the line to seek",
      copy: () => isDivider()
        ? (isHidden() ? "The progress line runs along the bottom edge. Drag it to jump anywhere in the song." : "The progress line is the top edge of the control bar. Drag it to jump anywhere in the song.")
        : "Drag along the line under the song to jump anywhere in it. Elapsed and total time sit at each end.",
      gesture: () => ({ kind: "swipe", el: $("#seek") || $(".player-view .timeline"), dx: 1 })
    },
    {
      target: () => isHidden() ? $(".player-view .transport") : [$(".player-view .transport"), $("#queue-toggle")],
      kicker: "PLAYBACK",
      title: () => isHidden() ? "Your compact controls" : "Playback and queue",
      copy: () => isHidden()
        ? "Shuffle, previous, play, next, repeat and the queue, all in one small row. Swipe up from the bottom edge to bring back the full bar."
        : "Shuffle, previous, play, next and repeat, with your queue on the far right. Swipe down on this bar to hide it for a bigger, cleaner player.",
      gesture: () => isHidden()
        ? { kind: "swipe", point: { x: innerWidth / 2, y: innerHeight - 52 }, dy: -1, distance: 26 }
        : { kind: "swipe", el: $(".player-view .transport"), dy: 1, distance: 18, offsetX: -0.12 }
    },
    {
      target: () => $("#dial"),
      kicker: "VOLUME",
      title: () => isBar() ? "Swipe the bar. Press to play." : "Swipe the dial. Tap to play.",
      copy: () => `Swipe up or down for volume. ${isBar() ? "Press the top button" : "Tap the dial"} once to play or pause, twice to skip ahead, three times to go back. Swipe it right to tuck it away; tap the arrow to bring it back.`,
      gesture: () => ({ kind: "updown", el: $("#dial") })
    },
    {
      target: () => $(".preset-bar"),
      kicker: "TABS",
      title: () => "Press the arrow for tabs",
      copy: () => "The arrow at the top opens this row: your style preset, Now Playing, Playlists, Devices, Settings and refresh. You can also swipe down in the middle of the player.",
      // The tab row stays closed for the rest of the tour; it opens only for this step.
      enter: () => setTabs(false),
      leave: () => setTabs(true),
      settle: 360,
      gesture: () => ({ kind: "tap", el: $("#bar-handle") })
    },
    {
      target: () => $("#spotify-track-link"),
      kicker: "SPOTIFY",
      title: () => "Jump to Spotify",
      copy: () => "Opens the current song in the Spotify app. Replay this tour anytime from Settings, where you can also hide the on-screen hint text.",
      gesture: () => ({ kind: "tap", el: $("#spotify-track-link") })
    }
  ];

  let tabsWereOpen = false;
  const setTabs = (hidden) => { if (typeof setTopBarHidden === "function" && remoteShell.classList.contains("topbar-hidden") !== hidden) setTopBarHidden(hidden); };
  let root = null, hole = null, finger = null, card = null, active = [], index = 0, onDone = null, settleTimer = null;

  function build() {
    root = document.createElement("div");
    root.className = "np-tour";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "np-tour-title");
    root.innerHTML = '<div class="np-tour-hole" aria-hidden="true"></div><div class="np-tour-finger" aria-hidden="true"></div><section class="np-tour-card" tabindex="-1"><header><small id="np-tour-kicker"></small><span id="np-tour-count" aria-live="polite"></span></header><h2 id="np-tour-title"></h2><p id="np-tour-copy"></p><div class="np-tour-actions"><button type="button" data-tour="skip">Skip</button><button type="button" data-tour="back">Back</button><button type="button" class="primary" data-tour="next">Next</button></div></section>';
    hole = root.querySelector(".np-tour-hole");
    finger = root.querySelector(".np-tour-finger");
    card = root.querySelector(".np-tour-card");
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-tour]")?.dataset.tour;
      if (action === "skip") finish();
      if (action === "back") go(index - 1);
      if (action === "next") index >= active.length - 1 ? finish() : go(index + 1);
    });
    // Block the player underneath so a stray touch cannot skip, seek or change volume.
    ["pointerdown", "pointerup", "touchstart"].forEach((type) => root.addEventListener(type, (event) => event.stopPropagation()));
    document.body.append(root);
  }

  function rectOf(target) {
    const els = (Array.isArray(target) ? target : [target]).filter(visible);
    if (!els.length) return null;
    const rs = els.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
    // Keep the outline on screen, even for controls that sit partly off the edge.
    const pad = 8;
    const x1 = Math.max(4, left - pad), y1 = Math.max(4, top - pad);
    const x2 = Math.min(innerWidth - 4, right + pad), y2 = Math.min(innerHeight - 4, bottom + pad);
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1, right: x2, bottom: y2 };
  }

  function placeCard(r) {
    const width = Math.min(340, innerWidth - EDGE * 2, Math.max(260, innerWidth * 0.4));
    card.style.width = `${width}px`;
    const height = card.offsetHeight;
    const space = { right: innerWidth - r.right, left: r.left, below: innerHeight - r.bottom, above: r.top };
    let left, top;
    if (space.right >= width + GAP + EDGE || space.left >= width + GAP + EDGE) {
      left = space.right >= space.left ? r.right + GAP + 8 : r.left - GAP - 8 - width;
      top = r.top + r.height / 2 - height / 2;
    } else {
      top = space.below >= space.above ? r.bottom + GAP + 8 : r.top - GAP - 8 - height;
      left = r.left + r.width / 2 - width / 2;
    }
    left = Math.max(EDGE, Math.min(innerWidth - width - EDGE, left));
    top = Math.max(EDGE, Math.min(innerHeight - height - EDGE, top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  // An animated fingertip acts out the step's gesture on the real control.
  function showGesture(step) {
    const g = step.gesture?.();
    let x, y, w = 0, h = 0;
    if (g?.point) ({ x, y } = g.point);
    else if (g?.el && visible(g.el)) {
      const r = g.el.getBoundingClientRect();
      // Use only the on-screen part, so a dial half off the edge gets a reachable spot.
      const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      w = right - left; h = bottom - top;
      x = left + w / 2 + (g.offsetX || 0) * w; y = top + h / 2;
    }
    if (!g || x === undefined) { finger.hidden = true; return; }
    const distance = g.distance || Math.max(18, Math.min(g.kind === "updown" ? 46 : 80, (g.dx ? w : h) * 0.28));
    finger.hidden = false;
    finger.dataset.kind = g.kind;
    finger.style.left = `${Math.max(24, Math.min(innerWidth - 24, x))}px`;
    finger.style.top = `${Math.max(24, Math.min(innerHeight - 24, y))}px`;
    finger.style.setProperty("--dx", `${(g.dx || 0) * distance}px`);
    finger.style.setProperty("--dy", `${(g.dy || 0) * distance}px`);
    finger.style.setProperty("--travel", `${distance}px`);
    // Restart the animation from its first frame on every step.
    finger.style.animation = "none"; void finger.offsetWidth; finger.style.animation = "";
  }

  function render() {
    const step = active[index];
    if (!step) return;
    const r = rectOf(step.target());
    $("#np-tour-kicker").textContent = step.kicker;
    $("#np-tour-count").textContent = `${index + 1} / ${active.length}`;
    $("#np-tour-title").textContent = step.title();
    $("#np-tour-copy").textContent = step.copy();
    root.querySelector('[data-tour="back"]').hidden = index === 0;
    root.querySelector('[data-tour="next"]').textContent = index === active.length - 1 ? "Done" : "Next";
    if (r) {
      hole.hidden = false;
      const round = r.width < 96 && Math.abs(r.width - r.height) < 12;
      Object.assign(hole.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: round ? "999px" : "" });
      placeCard(r);
      showGesture(step);
    } else {
      hole.hidden = true;
      finger.hidden = true;
      placeCard({ left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2 - 1, bottom: innerHeight / 2 + 1, width: 0, height: 2 });
    }
  }

  function go(next) {
    if (next < 0 || next >= active.length) return;
    active[index]?.leave?.();
    index = next;
    const step = active[index];
    step.enter?.();
    clearTimeout(settleTimer);
    if (step.settle) { render(); settleTimer = setTimeout(render, step.settle); } else render();
    card.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (!root) return;
    if (event.key === "Escape") { event.preventDefault(); finish(); }
    if (event.key === "ArrowRight") { event.preventDefault(); index >= active.length - 1 ? finish() : go(index + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
  }
  const onResize = () => { if (root) requestAnimationFrame(render); };

  function finish() {
    if (!root) return;
    clearTimeout(settleTimer);
    active[index]?.leave?.();
    if (tabsWereOpen) setTabs(false);
    tabsWereOpen = false;
    root.remove();
    root = null;
    document.removeEventListener("keydown", onKey, true);
    removeEventListener("resize", onResize);
    removeEventListener("orientationchange", onResize);
    const done = onDone; onDone = null;
    done?.();
  }

  function start(options = {}) {
    if (root) return;
    onDone = options.onDone || null;
    if (typeof switchView === "function" && remoteShell.dataset.currentView !== "player") switchView("player");
    if (typeof setQueueDrawer === "function") setQueueDrawer(false);
    if (typeof setSideControlsHidden === "function") setSideControlsHidden(false);
    // Close the tab row while the tour runs; reopen it afterwards if it was open.
    tabsWereOpen = !remoteShell.classList.contains("topbar-hidden");
    setTabs(true);
    build();
    // Only steps whose control is on screen right now; the tabs step opens its own row.
    active = steps.filter((step) => step.enter || rectOf(step.target()));
    index = -1;
    document.addEventListener("keydown", onKey, true);
    addEventListener("resize", onResize);
    addEventListener("orientationchange", onResize);
    // Let a view switch settle before measuring.
    requestAnimationFrame(() => go(0));
  }

  window.turntableTour = { start, finish, isOpen: () => !!root };
})();
