// App shell: album colour, connection status, layout and font sizing, views, guides, dialogs and appearance settings.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
async function updateAlbumColor(url, uri) {
  if (!url || !uri) return;
  albumColorTrackUri = uri;
  if (albumColorCache.has(url)) {
    remote.style.setProperty("--album-color", albumColorCache.get(url));
    return;
  }
  const sampleColor = (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = 24; canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let red = 0; let green = 0; let blue = 0; let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 80) continue;
      red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
    }
    return count ? `rgb(${Math.max(18, Math.round(red / count * .55))} ${Math.max(18, Math.round(green / count * .55))} ${Math.max(18, Math.round(blue / count * .55))})` : null;
  };
  try {
    let image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    let objectUrl = null;
    try { await image.decode(); sampleColor(image); }
    catch {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Artwork unavailable");
      objectUrl = URL.createObjectURL(await response.blob());
      image = new Image(); image.src = objectUrl; await image.decode();
    }
    const color = sampleColor(image);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (!color) return;
    albumColorCache.set(url, color);
    if (albumColorTrackUri === uri) remote.style.setProperty("--album-color", color);
  } catch {
    if (albumColorTrackUri === uri) remote.style.setProperty("--album-color", "#34261f");
  }
}

function setMessage(text = "") { message.textContent = text; }
function connectionCopy(kind) {
  return {
    connected: ["Connected", "This device and Spotify playback are synchronized."],
    syncing: ["Syncing", "Applying the latest playback state from Spotify."],
    cached: ["Reconnecting", "Showing the last known playback while Spotify reconnects."],
    cooldown: ["Spotify cooldown", "Playback is cached until Spotify allows another request."],
    offline: ["Offline", "The last saved playback remains visible until Spotify can be reached again."],
    waiting: ["Waiting for Spotify", "Start a song in Spotify on any device to synchronize playback."]
  }[kind] || ["Checking connection", "Contacting Spotify..."];
}
function connectionAction(kind) {
  return {
    connected: "No action needed.",
    syncing: "Keep Spotify open and allow the update to finish.",
    cached: "Check your internet connection. Turntable retries automatically.",
    cooldown: "Wait for the automatic retry and avoid repeatedly pressing Refresh.",
    offline: "Check your internet connection, then press Refresh once.",
    waiting: "Play a song in Spotify on any device, then press Refresh once."
  }[kind] || "Wait for the current connection check to finish.";
}
function relativeSyncTime(timestamp) {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 2) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
function setConnectionState(kind, detail, options = {}) {
  const allowed = ["connected", "syncing", "cached", "cooldown", "offline", "waiting"];
  kind = allowed.includes(kind) ? kind : "waiting";
  const copy = connectionCopy(kind);
  connectionState = {
    kind,
    detail: detail || copy[1],
    updatedAt: options.updatedAt ?? connectionState.updatedAt,
    cacheAge: options.cacheAge ?? connectionState.cacheAge
  };
  const topDot = $("connection-dot");
  const cardDot = $("connection-status-dot");
  [topDot, cardDot].filter(Boolean).forEach((dot) => { dot.className = dot === topDot ? `connection-indicator ${kind}` : `connection-status-dot ${kind}`; });
  if (topDot) {
    topDot.title = `${copy[0]} — ${connectionState.detail}`;
    topDot.setAttribute("aria-label", `Connection status: ${copy[0]}`);
  }
  if ($("connection-status-title")) $("connection-status-title").textContent = copy[0];
  if ($("connection-status-detail")) $("connection-status-detail").textContent = connectionState.detail;
  if ($("connection-recommended-action")) $("connection-recommended-action").textContent = connectionAction(kind);
  if ($("connection-last-sync")) $("connection-last-sync").textContent = relativeSyncTime(connectionState.updatedAt);
  if ($("connection-cache-age")) $("connection-cache-age").textContent = Number.isFinite(connectionState.cacheAge) ? `${Math.max(0, Math.round(connectionState.cacheAge / 1000))}s` : "—";
}
function setOptimisticSetting(key, value, duration = 3_000) {
  optimisticSettings.set(key, { value, until: performance.now() + duration });
}
function optimisticSettingValue(key, serverValue) {
  const pending = optimisticSettings.get(key);
  if (!pending) return serverValue;
  if (pending.value === serverValue || performance.now() >= pending.until) {
    optimisticSettings.delete(key);
    return serverValue;
  }
  return pending.value;
}
function resolvedLayoutProfile() {
  if (layoutProfile !== "auto") return layoutProfile;
  const width = Math.max(innerWidth, innerHeight);
  const height = Math.min(innerWidth, innerHeight);
  if (height <= 430 || width <= 860) return "compact";
  if (width >= 1180 || height >= 700) return "wide";
  return "standard";
}
function applyLayoutProfile(next = layoutProfile) {
  layoutProfile = ["auto", "compact", "standard", "wide"].includes(next) ? next : "auto";
  localStorage.setItem("turntable-layout-profile", layoutProfile);
  remote.dataset.layoutProfile = layoutProfile;
  const resolved = resolvedLayoutProfile();
  remote.dataset.layoutResolved = resolved;
  document.querySelectorAll("[data-layout-profile-choice]").forEach((button) => {
    const active = button.dataset.layoutProfileChoice === layoutProfile;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-current", active ? "true" : "false");
  });
  const status = $("screen-fit-status");
  if (status) status.textContent = layoutProfile === "auto" ? `Auto → ${resolved[0].toUpperCase()}${resolved.slice(1)}` : `Active: ${resolved[0].toUpperCase()}${resolved.slice(1)}`;
  syncAppearanceSliders();
}
function applyUIFontScale(value = uiFontScale) {
  uiFontScale = Math.max(90, Math.min(110, Math.round(Number(value) / 5) * 5));
  localStorage.setItem("turntable-ui-font-scale", String(uiFontScale));
  remote.style.setProperty("--ui-font-scale", String(uiFontScale / 100));
  if ($("ui-font-size")) $("ui-font-size").value = String(uiFontScale);
  if ($("ui-font-size-value")) $("ui-font-size-value").textContent = `${uiFontScale}%`;
  if ($("ui-font-size")) $("ui-font-size").setAttribute("aria-valuetext", `${uiFontScale} percent`);
}
function applyLyricFontScale(value = lyricFontScale, persist = true) {
  lyricFontScale = Math.max(90, Math.min(130, Math.round(Number(value) / 5) * 5));
  if (persist) localStorage.setItem("turntable-lyric-font-scale", String(lyricFontScale));
  const adjustment = `${(lyricFontScale - 100) * .2}px`;
  remote.style.setProperty("--lyric-font-adjust", adjustment);
  $("lyrics-panel")?.style.setProperty("--lyric-font-adjust", adjustment);
  $("lyrics-lines")?.style.setProperty("--lyric-font-adjust", adjustment);
  if ($("lyric-font-size")) $("lyric-font-size").value = String(lyricFontScale);
  if ($("lyric-font-size-value")) $("lyric-font-size-value").textContent = `${lyricFontScale}%`;
  if ($("lyric-font-size")) $("lyric-font-size").setAttribute("aria-valuetext", `${lyricFontScale} percent`);
}
async function loadDiagnostics() {
  try {
    const data = await api(spotify => spotify.diagnostics(), { cooldown: false });
    $("diag-minute").textContent = data.requests.last_minute;
    $("diag-hour").textContent = data.requests.last_hour;
    $("diag-cache-hits").textContent = data.requests.cache_hits_since_start;
    $("diag-server").textContent = data.connection.state.toUpperCase();
    $("diag-uptime").textContent = `${Math.floor(data.uptime_seconds / 60)} min uptime`;
    $("diag-connection").textContent = data.connection.cooldown_seconds
      ? `Spotify cooldown: ${data.connection.cooldown_seconds}s remaining.`
      : `Playback cache age: ${data.connection.playback_cache_age_seconds ?? "none"}s. Total calls since server start: ${data.requests.total_since_start}.`;
    const paths = $("diag-paths"); paths.replaceChildren();
    for (const item of data.requests.top_paths) {
      const row = document.createElement("li");
      const path = document.createElement("span"), count = document.createElement("b");
      path.textContent = item.path; count.textContent = item.count;
      row.append(path, count); paths.append(row);
    }
  } catch (error) {
    $("diag-connection").textContent = error.message;
  }
}
function setUpdateLogTab(tab = "updates") {
  const diagnostics = tab === "diagnostics";
  $("updates-panel").hidden = diagnostics;
  $("diagnostics-panel").hidden = !diagnostics;
  $("updates-tab").classList.toggle("active", !diagnostics);
  $("diagnostics-tab").classList.toggle("active", diagnostics);
  $("updates-tab").setAttribute("aria-selected", String(!diagnostics));
  $("diagnostics-tab").setAttribute("aria-selected", String(diagnostics));
  $("update-log-title").textContent = diagnostics ? "Live diagnostics" : "Latest 10 updates";
  if (diagnostics) {
    void loadDiagnostics();
    if (diagnosticsRefreshTimer) clearInterval(diagnosticsRefreshTimer);
    diagnosticsRefreshTimer = setInterval(loadDiagnostics, 5_000);
  } else if (diagnosticsRefreshTimer) {
    clearInterval(diagnosticsRefreshTimer);
    diagnosticsRefreshTimer = null;
  }
}
function showError(error) { setMessage(error.message); }
function physicalFeedback(kind = "tick") {
  if (kind === "press" && buttonHapticDispatchActive) return;
  const now = performance.now();
  if (kind === "tick" && now - lastFeedbackAt < 28) return;
  lastFeedbackAt = now;
  const switchControl = $("haptic-switch");
  if (switchControl) switchControl.click();
  if (navigator.vibrate) navigator.vibrate(kind === "press" ? 18 : 7);
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled || button.id === "dial") return;
  physicalFeedback("press");
  buttonHapticDispatchActive = true;
  queueMicrotask(() => { buttonHapticDispatchActive = false; });
}, true);
function disallowed(action) { return playback?.actions?.disallows?.[action] === true; }
function activeDeviceId() { return playback?.device?.id || undefined; }
function setButtonAvailability(button, unavailable, reason) {
  button.disabled = unavailable;
  button.title = unavailable ? reason : "";
}

function switchView(view) {
  const returningToPlayer = view === "player" && currentView !== "player";
  if (view !== "player") setQueueDrawer(false);
  currentView = view;
  remote.dataset.currentView = view;
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === view));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "playlists") loadPlaylists();
  if (view === "devices") {
    void refreshDevicesView();
    scheduleDevicesViewRefresh();
  } else scheduleDevicesViewRefresh();
  if (returningToPlayer) requestAnimationFrame(restoreNowPlayingMotion);
  if (session) scheduleStatusRefresh(view === "player" ? 0 : undefined);
}

async function restoreNowPlayingMotion() {
  if (albumStyle === "vinyl") {
    vinylTransitionToken += 1;
    if (vinylRateFrame) cancelAnimationFrame(vinylRateFrame);
    if (vinylRateResolver) vinylRateResolver(false);
    vinylRateFrame = null; vinylRateResolver = null;
    vinylSpinAnimation?.cancel(); vinylSpinAnimation = null;
    vinylIncomingSpinAnimation?.cancel(); vinylIncomingSpinAnimation = null;
    vinylSpinRate = 0; vinylTargetRate = 0;
    vinylTransitionPrepared = false; artworkTransitionActive = false;
    $("vinyl-transition-cover").style.display = "none";
    $("vinyl-transition-cover").removeAttribute("src");
    $("album-card").classList.remove("vinyl-transitioning", "vinyl-cover-blending", "vinyl-blend-settled", "swiping");
    const animation = ensureVinylSpin();
    animation.currentTime = clockPosition() % 9000;
    vinylSpinRate = playback?.is_playing ? 1 : 0;
    vinylTargetRate = vinylSpinRate;
    animation.playbackRate = vinylSpinRate;
    updateVinylSpinEffect(vinylSpinRate);
  }
  activeLyricIndex = -1;
  $("lyrics-lines").querySelectorAll(".active").forEach((line) => line.classList.remove("active"));
  updateActiveLyrics(clockPosition());
  await refresh();
  activeLyricIndex = -1;
  $("lyrics-lines").querySelectorAll(".active").forEach((line) => line.classList.remove("active"));
  updateActiveLyrics(clockPosition());
}

// The welcome card offers the tour; the tour itself spotlights the real player
// (now-playing-tour.js). v2 shows the new tour once to people who saw the old cards.
const NOW_PLAYING_GUIDE_KEY = "turntable-now-playing-guide-v2";
let nowPlayingGuideScheduled = false;
function openNowPlayingGuide() {
  const tour = $("now-playing-guide");
  if (!tour || window.turntableTour?.isOpen()) return;
  tour.hidden = false;
  requestAnimationFrame(() => $("now-playing-guide-card")?.focus());
}
function closeNowPlayingGuide(outcome = "completed") {
  const tour = $("now-playing-guide");
  if (tour) tour.hidden = true;
  if (outcome) localStorage.setItem(NOW_PLAYING_GUIDE_KEY, outcome);
}
function startNowPlayingTour() {
  closeNowPlayingGuide(null);
  if (!window.turntableTour) { closeNowPlayingGuide("completed"); return; }
  window.turntableTour.start({ onDone: () => localStorage.setItem(NOW_PLAYING_GUIDE_KEY, "completed") });
}
function maybeRequestNowPlayingGuide(delay = 900) {
  if (!session || nowPlayingGuideScheduled || localStorage.getItem(NOW_PLAYING_GUIDE_KEY)) return;
  nowPlayingGuideScheduled = true;
  setTimeout(() => {
    nowPlayingGuideScheduled = false;
    if (session && !localStorage.getItem(NOW_PLAYING_GUIDE_KEY)) openNowPlayingGuide();
  }, delay);
}
$("now-playing-guide-next").onclick = startNowPlayingTour;
$("now-playing-guide-dismiss").onclick = () => closeNowPlayingGuide("dismissed");
$("start-now-playing-guide").onclick = startNowPlayingTour;
function showRateWarning(detail = {}) {
  const warning = $("rate-warning");
  if (!warning) return;
  const count = Number(detail.count) || 30;
  $("rate-warning-copy").textContent = `Turntable made ${count} Spotify requests in the last minute. Avoid repeated refreshes, skips, and setting changes, then wait one minute before continuing.`;
  warning.hidden = false;
  requestAnimationFrame(() => $("rate-warning-dismiss")?.focus());
}
$("rate-warning-dismiss").onclick = () => { $("rate-warning").hidden = true; };
window.addEventListener("turntable:api-rate-warning", event => showRateWarning(event.detail));
function setTopBarHidden(hidden) {
  remote.classList.toggle("topbar-hidden", hidden);
  $("bar-handle").setAttribute("aria-label", hidden ? "Show quick views" : "Hide quick views");
  localStorage.setItem("turntable-topbar-hidden", String(hidden));
}

function setQueueDrawer(open) {
  remote.classList.toggle("queue-open", open);
  $("queue-toggle").setAttribute("aria-expanded", String(open));
  $("queue-toggle").setAttribute("aria-label", open ? "Close playback queue" : "Open playback queue");
  $("queue-drawer").setAttribute("aria-hidden", String(!open));
  if (open) setTimeout(() => $("queue-close").focus({ preventScroll: true }), 220);
  else if ($("queue-drawer").contains(document.activeElement)) $("queue-toggle").focus({ preventScroll: true });
}
function setUpdateLogOpen(open) {
  const modal = $("update-log-modal");
  modal.hidden = !open;
  if (open) {
    setQueueDrawer(false);
    setUpdateLogTab("updates");
    setTimeout(() => $("update-log-close").focus({ preventScroll: true }), 0);
  } else {
    if (diagnosticsRefreshTimer) clearInterval(diagnosticsRefreshTimer);
    diagnosticsRefreshTimer = null;
    if (modal.contains(document.activeElement)) $("version-indicator").focus({ preventScroll: true });
  }
}
function normalizedBackgroundColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#34261f";
}
function backgroundOverlay(color) {
  const value = normalizedBackgroundColor(color);
  const red = parseInt(value.slice(1, 3), 16);
  const green = parseInt(value.slice(3, 5), 16);
  const blue = parseInt(value.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},.62)`;
}
function applyBackgroundColorMode(nextMode = backgroundColorMode, nextColor = manualBackgroundColor) {
  backgroundColorMode = nextMode === "manual" ? "manual" : "auto";
  manualBackgroundColor = normalizedBackgroundColor(nextColor);
  remote.dataset.backgroundColorMode = backgroundColorMode;
  remote.style.setProperty("--manual-background-color", manualBackgroundColor);
  remote.style.setProperty("--manual-background-overlay", backgroundOverlay(manualBackgroundColor));
  localStorage.setItem("turntable-background-color-mode", backgroundColorMode);
  localStorage.setItem("turntable-manual-background-color", manualBackgroundColor);
  document.querySelectorAll("[data-background-color-mode]").forEach((button) => {
    const active = button.dataset.backgroundColorMode === backgroundColorMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const picker = $("background-color-picker");
  if (picker) picker.value = manualBackgroundColor;
}
function applyAppearance(nextAlbum = albumStyle, nextControl = controlStyle, nextDisplay = displayStyle, nextLyricsBackground = lyricsBackground, nextPlayerBackground = playerBackgroundStyle, nextLyricStyle = lyricStyle, nextPlaybackBarStyle = playbackBarStyle, nextGuideText = guideText, nextControlBarBackground = controlBarBackground) {
  const previousAlbum = albumStyle;
  const previousLyricStyle = lyricStyle;
  albumStyle = nextAlbum === "vinyl" ? "vinyl" : "square";
  controlStyle = nextControl === "bar" ? "bar" : "dial";
  displayStyle = nextDisplay === "lyrics" ? "lyrics" : "info";
  lyricsBackground = nextLyricsBackground === "solid" ? "solid" : "transparent";
  playerBackgroundStyle = nextPlayerBackground === "solid" ? "solid" : "artwork";
  lyricStyle = ["scroll", "word", "karaoke", "reveal", "focus"].includes(nextLyricStyle) ? nextLyricStyle : "scroll";
  playbackBarStyle = nextPlaybackBarStyle === "divider" ? "divider" : "default";
  guideText = nextGuideText === "hidden" ? "hidden" : "shown";
  controlBarBackground = ["opaque", "translucent", "transparent"].includes(nextControlBarBackground) ? nextControlBarBackground : "transparent";
  remote.dataset.album = albumStyle;
  remote.dataset.control = controlStyle;
  syncDisplayPresentation();
  requestAnimationFrame(refreshLyricsTrackMarquee);
  remote.dataset.lyricsBackground = lyricsBackground;
  remote.dataset.playerBackground = playerBackgroundStyle;
  remote.dataset.lyricStyle = lyricStyle;
  remote.dataset.playbackBar = playbackBarStyle;
  remote.dataset.guides = guideText;
  remote.dataset.controlBarBackground = controlBarBackground;
  localStorage.setItem("turntable-album-style", albumStyle);
  localStorage.setItem("turntable-control-style", controlStyle);
  localStorage.setItem("turntable-display-style", displayStyle);
  localStorage.setItem("turntable-lyrics-background", lyricsBackground);
  localStorage.setItem("turntable-player-background", playerBackgroundStyle);
  localStorage.setItem("turntable-lyric-style", lyricStyle);
  localStorage.setItem("turntable-playback-bar-style", playbackBarStyle);
  localStorage.setItem("turntable-guide-text", guideText);
  localStorage.setItem("turntable-control-bar-background", controlBarBackground);
  document.querySelectorAll("[data-album-choice]").forEach((button) => {
    const active = button.dataset.albumChoice === albumStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-control-choice]").forEach((button) => {
    const active = button.dataset.controlChoice === controlStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-display-choice]").forEach((button) => {
    const active = button.dataset.displayChoice === displayStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-lyrics-background-choice]").forEach((button) => {
    const active = button.dataset.lyricsBackgroundChoice === lyricsBackground;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-player-background-choice]").forEach((button) => {
    const active = button.dataset.playerBackgroundChoice === playerBackgroundStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-lyric-style-choice]").forEach((button) => {
    const active = button.dataset.lyricStyleChoice === lyricStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });  document.querySelectorAll("[data-playback-bar-choice]").forEach((button) => {
    const active = button.dataset.playbackBarChoice === playbackBarStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-guide-choice]").forEach((button) => {
    const active = button.dataset.guideChoice === guideText;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-control-bar-background-choice]").forEach((button) => {
    const active = button.dataset.controlBarBackgroundChoice === controlBarBackground;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });  syncAppearanceSliders();

  if (albumStyle === "vinyl" && previousAlbum !== "vinyl") {
    turntableTrackUri = null;
    resetTurntableRotation(playback?.item?.uri);
  }
  if (albumStyle !== "vinyl" && previousAlbum === "vinyl") {
    vinylTransitionToken += 1;
    if (vinylRateFrame) cancelAnimationFrame(vinylRateFrame);
    if (vinylRateResolver) vinylRateResolver(false);
    vinylRateFrame = null; vinylRateResolver = null;
    vinylSpinAnimation?.cancel(); vinylSpinAnimation = null;
    vinylIncomingSpinAnimation?.cancel(); vinylIncomingSpinAnimation = null;
    vinylSpinRate = 0; vinylTargetRate = 0; vinylTransitionPrepared = false;
    artworkTransitionActive = false;
    $("vinyl-transition-cover").style.display = "none";
    $("vinyl-transition-cover").removeAttribute("src");
    $("album-card").classList.remove("vinyl-transitioning", "vinyl-cover-blending", "vinyl-blend-settled");
    $("cover").classList.remove("vinyl-cover-swap");
  }
  if (displayStyle === "lyrics") {
    if (lyricsTrackUri !== playback?.item?.uri) loadLyrics(playback?.item);
    else if (previousLyricStyle !== lyricStyle && lyricsLines.length) {
      renderLyricsLayout();
      updateActiveLyrics(clockPosition());
    }
  }
  if (displayStyle === "lyrics" || playerBackgroundStyle === "solid") updateAlbumColor(artwork(playback?.item), playback?.item?.uri);
  if (displayStyle === 'lyrics') void prefetchLyrics(state?.queue?.[0]);
}

function applyVolumeWeight(nextWeight = volumeWeight) {
  volumeWeight = ["light", "medium", "heavy"].includes(nextWeight) ? nextWeight : "heavy";
  localStorage.setItem("turntable-volume-weight", volumeWeight);
  remote.dataset.volumeWeight = volumeWeight;
  document.querySelectorAll("[data-volume-weight-choice]").forEach((button) => {
    const active = button.dataset.volumeWeightChoice === volumeWeight;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncAppearanceSliders();
}

function syncAppearanceSliders() {
  document.querySelectorAll(".theme-options").forEach((group) => {
    const buttons = [...group.children].filter((element) => element.matches("button"));
    if (!buttons.length) return;
    const activeIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains("active")));
    group.style.setProperty("--segment-width", `calc(${100 / buttons.length}% - ${6 / buttons.length}px)`);
    group.style.setProperty("--segment-shift", `${activeIndex * 100}%`);
  });
}
