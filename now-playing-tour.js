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
      copy: () => `Swipe your ${isVinyl() ? "record" : "album art"} left for the next song or right to go back.${isHidden() ? " A quick tap plays or pauses." : ""}`
    },
    {
      target: () => $("#track-like"),
      kicker: "LIKED SONGS",
      title: () => "Save the song you hear",
      copy: () => "Tap the heart to add this song to your Liked Songs, and tap again to remove it. Green means it is saved."
    },
    {
      target: () => $(".player-view .timeline"),
      kicker: "TIMELINE",
      title: () => "Drag the line to seek",
      copy: () => isDivider()
        ? (isHidden() ? "The progress line runs along the bottom edge. Drag it to jump anywhere in the song." : "The progress line is the top edge of the control bar. Drag it to jump anywhere in the song.")
        : "Drag along the line under the song to jump anywhere in it. Elapsed and total time sit at each end."
    },
    {
      target: () => isHidden() ? $(".player-view .transport") : [$(".player-view .transport"), $("#queue-toggle")],
      kicker: "PLAYBACK",
      title: () => isHidden() ? "Your compact controls" : "Playback and queue",
      copy: () => isHidden()
        ? "Shuffle, previous, play, next, repeat and the queue, all in one small row. Hold Shuffle for Smart Mix. Swipe up from the bottom edge to bring back the full bar."
        : "Shuffle, previous, play, next and repeat, with your queue on the far right. Hold Shuffle for Smart Mix. Swipe down on this bar to hide it for a bigger, cleaner player."
    },
    {
      target: () => $("#dial"),
      kicker: "VOLUME",
      title: () => isBar() ? "Swipe the bar. Press to play." : "Swipe the dial. Tap to play.",
      copy: () => `Swipe up or down for volume. ${isBar() ? "Press the top button" : "Tap the dial"} once to play or pause, twice to skip ahead, three times to go back. Swipe it right to tuck it away; tap the arrow to bring it back.`
    },
    {
      target: () => $(".preset-bar"),
      kicker: "TABS",
      title: () => "Press the arrow for tabs",
      copy: () => "The arrow at the top opens this row: your style preset, Now Playing, Playlists, Devices, Settings and refresh. You can also swipe down in the middle of the player.",
      enter: () => { tabsWereHidden = remoteShell.classList.contains("topbar-hidden"); if (tabsWereHidden && typeof setTopBarHidden === "function") setTopBarHidden(false); },
      leave: () => { if (tabsWereHidden && typeof setTopBarHidden === "function") setTopBarHidden(true); tabsWereHidden = false; },
      settle: 360
    },
    {
      target: () => $("#spotify-track-link"),
      kicker: "SPOTIFY",
      title: () => "Jump to Spotify",
      copy: () => "Opens the current song in the Spotify app. Replay this tour anytime from Settings, where you can also hide the on-screen hint text."
    }
  ];

  let tabsWereHidden = false;
  let root = null, hole = null, card = null, active = [], index = 0, onDone = null, settleTimer = null;

  function build() {
    root = document.createElement("div");
    root.className = "np-tour";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "np-tour-title");
    root.innerHTML = '<div class="np-tour-hole" aria-hidden="true"></div><section class="np-tour-card" tabindex="-1"><header><small id="np-tour-kicker"></small><span id="np-tour-count" aria-live="polite"></span></header><h2 id="np-tour-title"></h2><p id="np-tour-copy"></p><div class="np-tour-actions"><button type="button" data-tour="skip">Skip</button><button type="button" data-tour="back">Back</button><button type="button" class="primary" data-tour="next">Next</button></div></section>';
    hole = root.querySelector(".np-tour-hole");
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
    } else {
      hole.hidden = true;
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
