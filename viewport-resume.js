(() => {
  // iOS may restore a Home Screen window before its viewport dimensions settle.
  // Keep this separate from playback: no reload, Spotify requests, or saved size.
  const applePhone = /iPhone|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone === true || window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
  if (!applePhone || !standalone) return;
  const root = document.documentElement;
  const player = document.getElementById("remote");
  const viewport = window.visualViewport;
  const settleDelays = [100, 300, 700, 1500, 3000];
  const timers = new Set();
  let frame = null;
  let lastHeight = 0;
  const editing = element => !!element?.matches("textarea,select,[contenteditable]:not([contenteditable='false']),input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit'])");
  function cancelChecks() {
    timers.forEach(clearTimeout);
    timers.clear();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  function measure() {
    frame = null;
    if (document.hidden || !player || player.hidden || editing(document.activeElement)) return;
    if (viewport && Math.abs((viewport.scale || 1) - 1) > .01) return;
    const width = window.innerWidth;
    // Do not use pre-rotation VisualViewport dimensions with a new orientation.
    const visualHeight = viewport && Math.abs(viewport.width - width) < 2 && Math.abs(viewport.offsetTop || 0) < 2 ? viewport.height : 0;
    const height = Math.round(Math.max(window.innerHeight, visualHeight));
    if (!Number.isFinite(height) || height < 120 || width < 120) return;
    // A concrete height replaces stale vh/svh/dvh results; safe-area padding is
    // still owned by the existing CSS and is never added or subtracted here.
    root.style.setProperty("--turntable-viewport-height", `${height}px`);
    root.dataset.standaloneViewport = "iphone";
    const changed = height !== lastHeight;
    lastHeight = height;
    if (changed) window.dispatchEvent(new CustomEvent("turntable:viewport-layout"));
  }
  function queueMeasure() {
    if (!document.hidden && frame === null) frame = requestAnimationFrame(measure);
  }
  function settle() {
    cancelChecks();
    if (document.hidden) return;
    queueMeasure();
    settleDelays.forEach(delay => {
      const timer = setTimeout(() => { timers.delete(timer); queueMeasure(); }, delay);
      timers.add(timer);
    });
  }
  window.addEventListener("pageshow", settle);
  window.addEventListener("focus", settle);
  window.addEventListener("orientationchange", settle);
  window.addEventListener("resize", settle);
  window.addEventListener("pagehide", cancelChecks);
  document.addEventListener("visibilitychange", () => document.hidden ? cancelChecks() : settle());
  document.addEventListener("focusout", event => { if (editing(event.target)) settle(); });
  viewport?.addEventListener("resize", queueMeasure);
  settle(); // Also handles a fresh launch, even if pageshow fired before loading.
})();
