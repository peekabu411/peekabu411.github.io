// Optional hidden control bar: the full-width transport bar collapses into a compact
// row (shuffle, previous, play, next, repeat, queue) placed beside the song.
// Default playback bar: the row sits between the elapsed and total times.
// Divider playback bar: the row sits under the song (or lyrics) and the progress
// line moves to the bottom edge. The choice is saved with presets.
(() => {
  const STORAGE_KEY = "turntable-control-bar";
  const remoteShell = document.getElementById("remote");
  const transport = document.querySelector(".player-view .transport");
  const queueToggle = document.getElementById("queue-toggle");
  const timelineRow = document.querySelector(".player-view .timeline > div");
  const durationLabel = document.getElementById("duration");
  const trackCopy = document.querySelector(".player-view .track-copy");
  const lyricsPanelEl = document.getElementById("lyrics-panel");
  const albumCardEl = document.getElementById("album-card");
  const tapFeedback = document.getElementById("art-tap-feedback");
  const playButton = document.getElementById("play");
  if (!remoteShell || !transport || !queueToggle || !timelineRow || !durationLabel || !trackCopy) return;

  const transportHome = { parent: transport.parentNode, next: transport.nextSibling };
  const queueHome = { parent: queueToggle.parentNode, next: queueToggle.nextSibling };
  let state = localStorage.getItem(STORAGE_KEY) === "hidden" ? "hidden" : "shown";

  function restore(node, home) {
    if (node.parentNode === home.parent && node.nextSibling === home.next) return;
    home.parent.insertBefore(node, home.next && home.next.parentNode === home.parent ? home.next : null);
  }

  function placeControls() {
    if (state !== "hidden") {
      restore(transport, transportHome);
      restore(queueToggle, queueHome);
      return;
    }
    if (queueToggle.parentNode !== transport) transport.append(queueToggle);
    const divider = remoteShell.dataset.playbackBar === "divider";
    const lyrics = remoteShell.dataset.display === "lyrics";
    let target = "row";
    if (divider) target = lyrics && lyricsPanelEl ? "lyrics" : "copy";
    transport.dataset.compactPlacement = target;
    if (target === "row" && transport.nextSibling !== durationLabel) timelineRow.insertBefore(transport, durationLabel);
    if (target === "lyrics" && lyricsPanelEl.nextSibling !== transport) lyricsPanelEl.after(transport);
    if (target === "copy" && transport.parentNode !== trackCopy) trackCopy.append(transport);
  }

  function syncChoiceButtons() {
    document.querySelectorAll("[data-control-bar-choice]").forEach((button) => {
      const active = button.dataset.controlBarChoice === state;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (typeof syncAppearanceSliders === "function") syncAppearanceSliders();
  }

  function applyControlBarState(next) {
    state = next === "hidden" ? "hidden" : "shown";
    remoteShell.dataset.controlBar = state;
    localStorage.setItem(STORAGE_KEY, state);
    placeControls();
    syncChoiceButtons();
    window.dispatchEvent(new CustomEvent("turntable:control-bar", { detail: { state } }));
  }
  window.applyControlBar = applyControlBarState;
  window.getControlBarState = () => state;

  // Re-place the compact row whenever the playback bar or display style changes.
  new MutationObserver(placeControls).observe(remoteShell, { attributes: true, attributeFilter: ["data-playback-bar", "data-display"] });

  document.querySelectorAll("[data-control-bar-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof physicalFeedback === "function") physicalFeedback("press");
      applyControlBarState(button.dataset.controlBarChoice);
    });
  });

  // Gestures: swipe down on the control bar hides it; swipe up from just above the
  // bottom edge brings it back. The Settings switch does the same thing.
  const SHOW_ZONE = 76;
  let gesture = null;
  let suppressClickUntil = 0;
  function isInteractive(target) { return !!target.closest("button,input,a[href],.album-art,.dial-rail,.queue-drawer,.timeline"); }
  remoteShell.addEventListener("pointerdown", (event) => {
    gesture = null;
    if (remoteShell.dataset.currentView !== "player" || remoteShell.classList.contains("queue-open")) return;
    if (state === "shown") {
      if (!event.target.closest(".player-view .transport")) return;
    } else {
      const bounds = remoteShell.getBoundingClientRect();
      if (bounds.bottom - event.clientY > SHOW_ZONE || isInteractive(event.target)) return;
    }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: state === "shown" ? "hide" : "show" };
    // Keep the centre swipe (which shows or hides the top tabs) from also running.
    if (!isInteractive(event.target)) event.stopPropagation();
  }, true);
  // Act as soon as the finger has travelled far enough, so a swipe that runs off the
  // bottom edge of the screen still counts.
  function finishGesture(event) {
    if (!gesture || gesture.id !== event.pointerId) return false;
    const { mode } = gesture;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dy) < 28 || Math.abs(dy) < Math.abs(dx) * 1.2) return false;
    if (mode === "hide" && dy > 0) {
      gesture = null;
      suppressClickUntil = performance.now() + 450;
      if (typeof physicalFeedback === "function") physicalFeedback("press");
      applyControlBarState("hidden");
      window.turntablePresetDirtyCheck?.();
      if (typeof setMessage === "function") setMessage("Control bar hidden. Swipe up from the bottom to bring it back.");
      return true;
    }
    if (mode === "show" && dy < 0) {
      gesture = null;
      suppressClickUntil = performance.now() + 450;
      if (typeof physicalFeedback === "function") physicalFeedback("press");
      applyControlBarState("shown");
      window.turntablePresetDirtyCheck?.();
      return true;
    }
    return false;
  }
  remoteShell.addEventListener("pointermove", finishGesture, true);
  remoteShell.addEventListener("pointerup", (event) => {
    finishGesture(event);
    if (gesture && gesture.id === event.pointerId) gesture = null;
  }, true);
  remoteShell.addEventListener("pointercancel", () => { gesture = null; }, true);
  document.addEventListener("click", (event) => {
    if (performance.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // While the bar is hidden, a quick tap on the artwork plays or pauses.
  let tap = null;
  albumCardEl?.addEventListener("pointerdown", (event) => {
    tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  });
  albumCardEl?.addEventListener("pointercancel", () => { tap = null; });
  albumCardEl?.addEventListener("pointerup", (event) => {
    if (!tap || tap.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    const quick = performance.now() - tap.at < 450;
    tap = null;
    if (state !== "hidden" || moved > 10 || !quick || !playButton || playButton.disabled) return;
    const willPlay = playButton.getAttribute("aria-label") === "Play";
    if (tapFeedback) {
      tapFeedback.textContent = willPlay ? "▶" : "❚❚";
      tapFeedback.classList.remove("show");
      void tapFeedback.offsetWidth;
      tapFeedback.classList.add("show");
    }
    if (typeof physicalFeedback === "function") physicalFeedback("press");
    playButton.click();
  });

  // Divider playback bar while hidden: the progress line is a small pill centred above the home bar.
  // Tapping it lifts a full-width scrubber; dragging it lifts and scrubs straight away (relative to
  // where the finger started, so the song does not jump). Once lifted, a tap or drag seeks to the
  // finger position. It tucks back into the pill shortly after the finger lifts.
  const seekInput = document.getElementById("seek");
  const timelineEl = seekInput?.closest(".timeline");
  if (seekInput && timelineEl) {
    let scrub = null;
    let tuckTimer = 0;
    const pillActive = () => state === "hidden" && remoteShell.dataset.playbackBar === "divider";
    const tuck = (delay) => {
      clearTimeout(tuckTimer);
      tuckTimer = setTimeout(() => { if (!scrub) timelineEl.classList.remove("lifted"); }, delay);
    };
    const valueAt = (clientX) => {
      const box = seekInput.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - box.left) / (box.width || 1)));
      return fraction * (Number(seekInput.max) || 0);
    };
    const setSeek = (value) => {
      const maximum = Number(seekInput.max) || 0;
      seekInput.value = String(Math.max(0, Math.min(maximum, value)));
      seekInput.dispatchEvent(new Event("input", { bubbles: true }));
    };
    timelineEl.addEventListener("pointerdown", (event) => {
      if (!pillActive() || seekInput.disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      try { timelineEl.setPointerCapture(event.pointerId); } catch {}
      const wasLifted = timelineEl.classList.contains("lifted");
      clearTimeout(tuckTimer);
      timelineEl.classList.add("lifted");
      scrub = { id: event.pointerId, x: event.clientX, start: Number(seekInput.value), wasLifted, moved: false };
      if (wasLifted) setSeek(valueAt(event.clientX));
    });
    timelineEl.addEventListener("pointermove", (event) => {
      if (!scrub || scrub.id !== event.pointerId) return;
      const dx = event.clientX - scrub.x;
      if (!scrub.moved && Math.abs(dx) < 4) return;
      scrub.moved = true;
      if (scrub.wasLifted) setSeek(valueAt(event.clientX));
      else setSeek(scrub.start + dx / (seekInput.getBoundingClientRect().width || 1) * (Number(seekInput.max) || 0));
    });
    const endScrub = (event, cancelled) => {
      if (!scrub || scrub.id !== event.pointerId) return;
      const { moved, wasLifted } = scrub;
      scrub = null;
      if (cancelled) { seekInput.onpointercancel?.(event); tuck(1500); return; }
      if (moved || wasLifted) {
        seekInput.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof physicalFeedback === "function") physicalFeedback("press");
        tuck(1800);
      } else {
        tuck(3500);
      }
    };
    timelineEl.addEventListener("pointerup", (event) => endScrub(event, false));
    timelineEl.addEventListener("pointercancel", (event) => endScrub(event, true));
    window.addEventListener("turntable:control-bar", () => { if (!pillActive()) timelineEl.classList.remove("lifted"); });
    new MutationObserver(() => { if (!pillActive()) timelineEl.classList.remove("lifted"); }).observe(remoteShell, { attributes: true, attributeFilter: ["data-playback-bar"] });
  }

  applyControlBarState(state);
})();
