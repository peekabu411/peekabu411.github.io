// Controls and gestures (buttons, seek, dial and bar, album swipes, lyric offset) and startup.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
fullscreenEnter.onclick = () => {
  if (configureFullscreenPrompt() === "request") requestAppFullscreen(false);
  else hideFullscreenPrompt();
};
fullscreenDismiss.onclick = () => {
  fullscreenDismissed = true;
  sessionStorage.setItem("turntable-fullscreen-dismissed", "true");
  hideFullscreenPrompt();
};
document.addEventListener("pointerup", (event) => {
  if (fullscreenDismissed || fullscreenActive() || remote.hidden || event.target.closest("#fullscreen-prompt,#rate-warning,a[href]")) return;
  requestAppFullscreen(true);
}, { capture: true });
document.addEventListener("fullscreenchange", () => fullscreenActive() ? hideFullscreenPrompt() : scheduleFullscreenPrompt(650));
document.addEventListener("webkitfullscreenchange", () => fullscreenActive() ? hideFullscreenPrompt() : scheduleFullscreenPrompt(650));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    scheduleStatusRefresh();
    scheduleDevicesViewRefresh();
  } else {
    scheduleFullscreenPrompt(700);
    if (currentView === "player") refresh().then(() => scheduleStatusRefresh());
    if (currentView === "devices") {
      void refreshDevicesView();
      scheduleDevicesViewRefresh();
    }
  }
});
["gesturestart", "gesturechange", "gestureend"].forEach((name) => {
  document.addEventListener(name, (event) => event.preventDefault(), { passive: false });
});
document.addEventListener("touchmove", (event) => {
  if (event.touches?.length > 1) event.preventDefault();
}, { passive: false });
document.addEventListener("wheel", (event) => {
  if (event.ctrlKey) event.preventDefault();
}, { passive: false });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key)) event.preventDefault();
});
$("pair").onclick = async () => {
  requestAppFullscreen(true);
  const pairButton = $("pair");
  const originalLabel = pairButton.textContent;
  pairButton.disabled = true;
  pairButton.textContent = "Connecting...";
  $("pair-error").textContent = "Opening Spotify...";
  try {
    // Sends the browser to Spotify to approve access; Spotify returns to Turntable afterwards.
    await window.turntableSpotify.connect($("pin").value);
  } catch (error) {
    $("pair-error").textContent = error.message;
  } finally {
    pairButton.disabled = false;
    pairButton.textContent = originalLabel;
  }
};$("pin").addEventListener("keydown", (event) => { if (event.key === "Enter") $("pair").click(); });
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => { switchView(button.dataset.view); setTopBarHidden(true); });
document.querySelectorAll(".view-back").forEach((button) => button.onclick = () => { switchView("player"); setTopBarHidden(true); });
// Reloads the newest published Turntable, checking first that the site answers so a
// failed download leaves the current app running instead of a blank page.
$("refresh").onclick = async () => {
  const button = $("refresh");
  if (button.classList.contains("refreshing")) return;
  physicalFeedback("press");
  button.classList.add("refreshing");
  button.setAttribute("aria-busy", "true");
  setMessage("Checking for the latest Turntable...");
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set("app_refresh", String(Date.now()));
  nextUrl.hash = "";
  let lastError = new Error("Turntable did not answer.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(nextUrl, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (response.ok) {
        setMessage("Loading the latest Turntable...");
        setTimeout(() => location.replace(nextUrl.toString()), 100);
        return;
      }
      lastError = new Error(`The site returned ${response.status}.`);
    } catch (error) { lastError = error; }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600));
  }
  button.classList.remove("refreshing");
  button.setAttribute("aria-busy", "false");
  setMessage(`Refresh failed: ${lastError.message} Check your connection and try again.`);
};
$("play").onclick = () => playerAction(playback?.is_playing ? "pause" : "play");
$("previous").onclick = () => playerAction("previous"); $("next").onclick = () => playerAction("next");
$("seek").onpointerdown = () => { seekDragging = true; };
$("seek").oninput = () => {
  seekDragging = true;
  const seek = $("seek");
  const position = Number(seek.value);
  const maximum = Number(seek.max) || 1;
  seek.style.setProperty("--seek-progress", `${Math.max(0, Math.min(100, position / maximum * 100))}%`);
  $("elapsed").textContent = formatTime(position);
};
function commitSeek() {
  if (!seekDragging) return;
  seekDragging = false;
  if (commandPending) {
    paintProgress();
    setMessage("Please wait for the current playback action to finish.");
    return;
  }
  const position = Number($("seek").value);
  const now = performance.now();
  pendingSeek = {
    uri: progressClock.uri,
    position,
    startedAt: now,
    expiresAt: now + SEEK_CONFIRM_GRACE_MS
  };
  progressClock = { ...progressClock, position, startedAt: now, correction: 0, correctionDuration: 0 };
  paintProgress(now);
  startProgressAnimation();
  void setting({ position_ms: position });
}$("seek").onchange = commitSeek;
$("seek").onpointerup = commitSeek;
$("seek").onpointercancel = () => { seekDragging = false; paintProgress(); };
$("volume").oninput = () => updateVolume(Number($("volume").value)); $("volume").onchange = () => setting({ volume_percent: Number($("volume").value) }, false);
$("shuffle").onclick = () => { const value = !optimisticSettingValue("shuffle", !!playback?.shuffle_state); setOptimisticSetting("shuffle", value); $("shuffle").classList.toggle("active", value); void setting({ shuffle: value }); };
$("repeat").onclick = () => { const current = optimisticSettingValue("repeat", playback?.repeat_state || "off"); const value = current === "off" ? "context" : current === "context" && !disallowed("toggling_repeat_track") ? "track" : "off"; repeatOneArmedUri = value === "track" ? playback?.item?.uri || null : null; repeatOneAutoOffPending = false; setOptimisticSetting("repeat", value); paintRepeatButton(value); void setting({ repeat: value }); };
document.querySelectorAll("[data-album-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(button.dataset.albumChoice, controlStyle, displayStyle, lyricsBackground); };
});
document.querySelectorAll("[data-control-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, button.dataset.controlChoice, displayStyle, lyricsBackground); };
});
document.querySelectorAll("[data-display-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, button.dataset.displayChoice, lyricsBackground); };
});
document.querySelectorAll("[data-lyrics-background-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, button.dataset.lyricsBackgroundChoice); };
});
document.querySelectorAll("[data-player-background-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground, button.dataset.playerBackgroundChoice); };
});
document.querySelectorAll("[data-background-color-mode]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyBackgroundColorMode(button.dataset.backgroundColorMode, manualBackgroundColor); };
});
$("background-color-picker").oninput = (event) => applyBackgroundColorMode("manual", event.target.value);
document.querySelectorAll("[data-lyric-style-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground, playerBackgroundStyle, button.dataset.lyricStyleChoice); };
});document.querySelectorAll("[data-playback-bar-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground, playerBackgroundStyle, lyricStyle, button.dataset.playbackBarChoice); };
});document.querySelectorAll("[data-guide-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground, playerBackgroundStyle, lyricStyle, playbackBarStyle, button.dataset.guideChoice); };
});document.querySelectorAll("[data-control-bar-background-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground, playerBackgroundStyle, lyricStyle, playbackBarStyle, guideText, button.dataset.controlBarBackgroundChoice); };
});document.querySelectorAll("[data-volume-weight-choice]").forEach((button) => {
  button.onclick = () => { physicalFeedback("press"); applyVolumeWeight(button.dataset.volumeWeightChoice); };
});document.querySelectorAll("[data-layout-profile-choice]").forEach((button) => {
  button.onclick = () => {
    physicalFeedback("press");
    applyLayoutProfile(button.dataset.layoutProfileChoice);
  };
});
$("ui-font-size").oninput = (event) => applyUIFontScale(event.target.value);
$("lyric-font-size").oninput = (event) => applyLyricFontScale(event.target.value, false);
$("lyric-font-size").onchange = (event) => applyLyricFontScale(event.target.value, true);
function lyricOffsetToSlider(value) {
  return Math.max(-1.2, Math.min(-0.2, Number(value)));
}
function lyricSliderToOffset(value) {
  return Math.max(-1.2, Math.min(-0.2, Number(value)));
}
function setLyricOffset(value, sliderPosition = lyricOffsetToSlider(value)) {
  lyricOffset = Math.max(-1.2, Math.min(-0.2, Math.round(Number(value) * 10) / 10));
  $("lyric-offset").value = String(Math.max(-1.2, Math.min(-0.2, sliderPosition)));
  const offsetText = `${lyricOffset > 0 ? "+" : ""}${lyricOffset.toFixed(1)}`;
  $("lyric-offset-value").textContent = `${offsetText}s`;
  $("lyric-offset").setAttribute("aria-valuetext", `${offsetText} seconds`);
  localStorage.setItem("turntable-lyric-offset", lyricOffset.toFixed(1));
  $("lyrics-lines").querySelectorAll(".active").forEach((line) => line.classList.remove("active"));
  activeLyricIndex = -1;
  activeLyricWordIndex = -1;
  updateActiveLyrics(clockPosition());
}
$("lyric-offset").oninput = (event) => setLyricOffset(lyricSliderToOffset(event.target.value), Number(event.target.value));

$("spotify-track-link").onclick = (event) => {
  physicalFeedback("press");
  event.preventDefault();
  event.stopPropagation();
  const destination = event.currentTarget.href || "https://open.spotify.com/";
  const opened = window.open(destination, "_blank");
  if (opened) opened.opener = null;
  else location.assign(destination);
};
$("playlist-organize").onclick = () => { playlistOrganizerMode = !playlistOrganizerMode; $("playlist-organize").classList.toggle("active", playlistOrganizerMode); $("playlist-organize").setAttribute("aria-pressed", String(playlistOrganizerMode)); $("playlist-organize").textContent = playlistOrganizerMode ? "Done" : "Organize"; $("playlist-reorder-hint").hidden = !playlistOrganizerMode; document.querySelector(".playlist-view").classList.toggle("organizing", playlistOrganizerMode); renderPlaylists(playlistLibrary); };
$("bar-handle").onclick = () => { physicalFeedback("press"); const opening = remote.classList.contains("topbar-hidden"); setTopBarHidden(!opening); if (opening) window.turntableHints?.used("tabs"); };
document.addEventListener("pointerup", (event) => {
  if (!remote.classList.contains("topbar-hidden") || event.button !== 0 || event.target.closest("button,input,select,a[href],#fullscreen-prompt,#rate-warning")) return;
  const handleBounds = $("bar-handle").getBoundingClientRect();
  const insideExpandedHandle = event.clientX >= handleBounds.left - 18 && event.clientX <= handleBounds.right + 18
    && event.clientY >= Math.max(0, handleBounds.top - 64) && event.clientY <= handleBounds.bottom;
  if (!insideExpandedHandle) return;
  physicalFeedback("press");
  setTopBarHidden(false);
  window.turntableHints?.used("tabs");
});
$("queue-toggle").onclick = () => { physicalFeedback("press"); const opening = !remote.classList.contains("queue-open"); setQueueDrawer(opening); if (opening) loadQueue(); };
$("queue-close").onclick = $("queue-backdrop").onclick = () => setQueueDrawer(false);
$("queue-drawer").addEventListener("pointerdown", (event) => { queueDrawerGesture = { x: event.clientX, y: event.clientY }; });
$("queue-drawer").addEventListener("pointerup", (event) => {
  if (!queueDrawerGesture) return;
  const dx = event.clientX - queueDrawerGesture.x;
  const dy = event.clientY - queueDrawerGesture.y;
  queueDrawerGesture = null;
  if (dx > 55 && Math.abs(dx) > Math.abs(dy)) { setQueueDrawer(false); window.turntableHints?.used("queue"); }
});
$("queue-drawer").addEventListener("pointercancel", () => { queueDrawerGesture = null; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setQueueDrawer(false); });
$("version-indicator").onclick = () => { physicalFeedback("press"); setUpdateLogOpen(true); };
$("updates-tab").onclick = () => setUpdateLogTab("updates");
$("diagnostics-tab").onclick = () => setUpdateLogTab("diagnostics");
$("diagnostics-refresh").onclick = () => void loadDiagnostics();
$("update-log-close").onclick = $("update-log-backdrop").onclick = () => setUpdateLogOpen(false);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setUpdateLogOpen(false); });

function setSideControlsHidden(hidden) {
  if (volumeUnavailable) return;
  sideControlsUserHidden = !!hidden && remote.dataset.currentView === "player";
  applySideControlsVisibility();
  if (sideControlsUserHidden) physicalFeedback("press");
}
$("side-control-reveal").onclick = () => {
  physicalFeedback("press");
  window.turntableHints?.used("volume");
  setSideControlsHidden(false);
};

const dialRail = document.querySelector(".dial-rail");
dialRail.addEventListener("pointerdown", (event) => {
  if (remote.classList.contains("side-controls-hidden") || remote.dataset.currentView !== "player") return;
  sideControlGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, mode: "hide" };
}, true);
dialRail.addEventListener("pointerup", (event) => {
  if (!sideControlGesture || sideControlGesture.mode !== "hide" || sideControlGesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - sideControlGesture.x;
  const dy = event.clientY - sideControlGesture.y;
  sideControlGesture = null;
  if (dx > 46 && Math.abs(dx) > Math.abs(dy) * 1.15) setSideControlsHidden(true);
}, true);
dialRail.addEventListener("pointercancel", () => { if (sideControlGesture?.mode === "hide") sideControlGesture = null; }, true);

remote.addEventListener("pointerdown", (event) => {
  if (remote.dataset.currentView !== "player" || volumeUnavailable) return;
  const hidden = remote.classList.contains("side-controls-hidden");
  const bounds = remote.getBoundingClientRect();
  const startRatio = hidden ? (2 / 3) : SIDE_CONTROL_HIDE_ZONE_START;
  if (event.clientX < bounds.left + bounds.width * startRatio) return;
  if (!hidden && event.target.closest("button,input,a[href],.album-art,.transport,.dial-rail")) return;
  sideControlGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, mode: hidden ? "show" : "hide" };
}, true);
remote.addEventListener("pointerup", (event) => {
  if (!sideControlGesture || sideControlGesture.pointerId !== event.pointerId) return;
  const mode = sideControlGesture.mode;
  const dx = event.clientX - sideControlGesture.x;
  const dy = event.clientY - sideControlGesture.y;
  sideControlGesture = null;
  if (mode === "hide" && dx > 46 && Math.abs(dx) > Math.abs(dy) * 1.15) setSideControlsHidden(true);
  if (mode === "show" && !volumeUnavailable && dx < -46 && Math.abs(dx) > Math.abs(dy) * 1.15) {
    physicalFeedback("press");
    setSideControlsHidden(false);
    window.turntableHints?.used("volume");
  }
}, true);
remote.addEventListener("pointercancel", () => { sideControlGesture = null; }, true);
$("unpair-phone").onclick = () => { physicalFeedback("press"); window.turntableAuth.disconnect(); location.reload(); };

const screen = document.querySelector(".screen");
screen.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button,input,a[href],.album-art,.dial")) return;
  if (sideControlGesture) return;
  if (remote.classList.contains("side-controls-hidden") && !volumeUnavailable && remote.dataset.currentView === "player" && event.clientX >= innerWidth * (2 / 3)) return;
  if (event.clientX <= innerWidth * .24 || event.clientX >= innerWidth * .76) return;
  screen.setPointerCapture(event.pointerId); barGesture = { y: event.clientY, dy: 0 };
});
screen.addEventListener("pointermove", (event) => { if (barGesture) barGesture.dy = event.clientY - barGesture.y; });
screen.addEventListener("pointerup", () => {
  if (!barGesture) return;
  if (barGesture.dy > 42) { physicalFeedback("press"); setTopBarHidden(false); window.turntableHints?.used("tabs"); }
  if (barGesture.dy < -42) { physicalFeedback("press"); setTopBarHidden(true); }
  barGesture = null;
});
screen.addEventListener("pointercancel", () => { barGesture = null; });

const dial = $("dial");
dial.addEventListener("pointerdown", (event) => {
  dial.setPointerCapture(event.pointerId);
  const rect = dial.getBoundingClientRect();
  const pressZone = controlStyle !== "bar" || event.clientY <= rect.top + 70;
  dial.classList.toggle("pressing-button", pressZone);
  dialStart = {
    x: event.clientX,
    y: event.clientY,
    volume: Number($("volume").value),
    moved: false,
    detent: Math.round(Number($("volume").value) / 2),
    rect,
    pressZone
  };
});
dial.addEventListener("pointermove", (event) => {
  if (!dialStart) return;
  const delta = dialStart.y - event.clientY;
  const horizontalDelta = event.clientX - dialStart.x;
  if (Math.abs(delta) > 3 || Math.abs(horizontalDelta) > 10) {
    dialStart.moved = true;
    dial.classList.remove("pressing-button");
    if (dialTapTimer) clearTimeout(dialTapTimer);
    dialTapTimer = null; dialTapCount = 0;
  }
  const nextVolume = dialVolumeFromDrag(event.clientY, dialStart);
  const detent = Math.round(nextVolume / 2);
  if (dialStart.moved && detent !== dialStart.detent) { dialStart.detent = detent; physicalFeedback("tick"); }
  updateVolume(nextVolume);
});
dial.addEventListener("pointerup", (event) => {
  if (!dialStart) return;
  dial.classList.remove("pressing-button");
  if (dialStart.moved) {
    updateVolume(dialVolumeFromDrag(event.clientY, dialStart));
    dialVolumeHoldUntil = performance.now() + 1800;
    setting({ volume_percent: Number($("volume").value) }, false);
    window.turntableHints?.used("adjust");
  }
  else if (dialStart.pressZone) {
    window.turntableHints?.used("press");
    physicalFeedback("tick"); dialTapCount += 1; dial.dataset.pendingTaps = String(dialTapCount);
    if (dialTapTimer) clearTimeout(dialTapTimer);
    dialTapTimer = setTimeout(() => {
      const taps = dialTapCount; dialTapCount = 0; dialTapTimer = null; dial.dataset.pendingTaps = "0";
      physicalFeedback("press");
      if (taps >= 3) playerAction("previous", { forceTrackChange: true, queueIfBusy: true });
      else if (taps === 2) playerAction("next", { queueIfBusy: true });
      else playerAction(playback?.is_playing ? "pause" : "play", { queueIfBusy: true });
    }, DIAL_MULTI_TAP_MS);
  }
  dialStart = null;
});
dial.addEventListener("pointercancel", () => { dial.classList.remove("pressing-button"); dialStart = null; });
dial.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", " ", "Enter"].includes(event.key)) return;
  event.preventDefault(); physicalFeedback([" ", "Enter"].includes(event.key) ? "press" : "tick");
  if ([" ", "Enter"].includes(event.key)) return playerAction(playback?.is_playing ? "pause" : "play");
  const amount = ["ArrowUp", "ArrowRight"].includes(event.key) ? 5 : -5;
  updateVolume(Number($("volume").value) + amount); setting({ volume_percent: Number($("volume").value) }, false);
});

const albumCard = $("album-card");
const artStage = document.querySelector(".art-stage");
function setUpcomingCardProgress(progress) {
  const amount = Math.max(0, Math.min(1, progress));
  artStage.style.setProperty("--next-scale", String(.9 + amount * .1));
  artStage.style.setProperty("--next-opacity", String(.55 + amount * .45));
}
function resetAlbumCard() {
  albumCard.classList.add("swipe-reset");
  albumCard.classList.remove("swipe-commit-left", "swipe-commit-right", "swiping");
  albumCard.style.transform = ""; albumCard.style.opacity = "";
  artStage.classList.remove("promote-next"); setUpcomingCardProgress(0);
  requestAnimationFrame(() => requestAnimationFrame(() => albumCard.classList.remove("swipe-reset")));
}
async function animateProgrammaticAlbumChange(direction, incomingCover, { automatic = false } = {}) {
  if (albumStyle !== "square" || !incomingCover || artworkTransitionActive) return;
  const token = ++artworkTransitionToken;
  artworkTransitionActive = true;
  $("next-cover").src = incomingCover;
  $("next-cover").style.display = "block";
  artStage.classList.add("promote-next");
  if (automatic) artStage.classList.add("auto-card-slide");
  fadeBackground(incomingCover);
  requestAnimationFrame(() => {
    albumCard.classList.add(direction === "previous" ? "swipe-commit-right" : "swipe-commit-left");
  });
  await new Promise((resolve) => setTimeout(resolve, automatic ? 620 : 300));
  if (token !== artworkTransitionToken) return;
  $("cover").src = incomingCover;
  $("cover").style.display = "block";
  albumCard.classList.add("swipe-reset");
  albumCard.classList.remove("swipe-commit-left", "swipe-commit-right");
  artStage.classList.remove("promote-next");
  artStage.classList.remove("auto-card-slide");
  setUpcomingCardProgress(0);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  artworkTransitionActive = false;
  showNextCover(artwork(state?.queue?.[0]));
  requestAnimationFrame(() => albumCard.classList.remove("swipe-reset"));
}
albumCard.addEventListener("pointerdown", (event) => {
  if (commandPending || !playback?.item) return;
  albumCard.setPointerCapture(event.pointerId);
  artSwipe = { x: event.clientX, y: event.clientY, dx: 0, horizontal: false, detent: 0 };
  albumCard.classList.add("swiping");
});
albumCard.addEventListener("pointermove", (event) => {
  if (!artSwipe) return;
  const dx = event.clientX - artSwipe.x; const dy = event.clientY - artSwipe.y;
  if (!artSwipe.horizontal && Math.abs(dx) > 8) artSwipe.horizontal = Math.abs(dx) > Math.abs(dy);
  if (!artSwipe.horizontal) return;
  event.preventDefault(); artSwipe.dx = dx;
  const detent = Math.trunc(Math.abs(dx) / 34);
  if (detent !== artSwipe.detent) { artSwipe.detent = detent; physicalFeedback("tick"); }
  if (albumStyle === "vinyl") return;
  albumCard.style.transform = `translate3d(${dx}px,0,0) rotate(${dx * 0.018}deg)`;
  albumCard.style.opacity = String(Math.max(.45, 1 - Math.abs(dx) / 420));
  setUpcomingCardProgress(dx < 0 ? Math.abs(dx) / 120 : 0);
});
async function finishAlbumSwipe() {
  if (!artSwipe) return;
  const dx = artSwipe.dx; artSwipe = null;
  const action = dx < -58 ? "next" : dx > 58 ? "previous" : null;
  const blocked = action === "next" ? disallowed("skipping_next") : action === "previous" ? disallowed("skipping_prev") : false;
  albumCard.classList.remove("swiping");
  if (!action || blocked) { resetAlbumCard(); return; }
  physicalFeedback("press");
  window.turntableHints?.used("skip");
  if (action === "next") previewQueuedTrack();
  if (albumStyle === "vinyl") {
    albumCard.style.transform = ""; albumCard.style.opacity = "";
    await playerAction(action, { forceTrackChange: action === "previous" });
    return;
  }
  if (action === "next") { artworkTransitionActive = true; artStage.classList.add("promote-next"); fadeBackground($("next-cover").src); }
  requestAnimationFrame(() => {
    albumCard.classList.add(action === "next" ? "swipe-commit-left" : "swipe-commit-right");
    albumCard.style.transform = ""; albumCard.style.opacity = "";
  });
  await new Promise((resolve) => setTimeout(resolve, 290));
  await playerAction(action, { forceTrackChange: action === "previous" });
  const currentCover = artwork(state?.playback?.item);
  $("cover").src = currentCover;
  $("cover").style.display = currentCover ? "block" : "none";
  albumCard.classList.add("swipe-reset");
  albumCard.classList.remove("swipe-commit-left", "swipe-commit-right");
  albumCard.style.transform = ""; albumCard.style.opacity = "";
  await new Promise((resolve) => requestAnimationFrame(resolve));
  artworkTransitionActive = false; artStage.classList.remove("promote-next"); setUpcomingCardProgress(0);
  showNextCover(artwork(state?.queue?.[0]));
  requestAnimationFrame(() => albumCard.classList.remove("swipe-reset"));
}
albumCard.addEventListener("pointerup", finishAlbumSwipe);
albumCard.addEventListener("pointercancel", () => { artSwipe = null; resetAlbumCard(); });

applyAppearance(albumStyle, controlStyle, displayStyle, lyricsBackground);
applyBackgroundColorMode(backgroundColorMode, manualBackgroundColor);
window.addEventListener("resize", () => requestAnimationFrame(refreshLyricsTrackMarquee));
applyVolumeWeight(volumeWeight);
applyLayoutProfile(layoutProfile);
applyUIFontScale(uiFontScale);
applyLyricFontScale(lyricFontScale);
setLyricOffset(lyricOffset);
setTopBarHidden(localStorage.getItem("turntable-topbar-hidden") !== "false");
if (session) { pairing.hidden = true; remote.hidden = false; hydrateClientSnapshot(); void startStatusRefreshCycle(); scheduleFullscreenPrompt(); maybeRequestNowPlayingGuide(1200); }
window.addEventListener("resize", () => applyLayoutProfile(layoutProfile));
window.addEventListener("turntable:viewport-layout", () => {
  applyLayoutProfile(layoutProfile);
  requestAnimationFrame(refreshLyricsTrackMarquee);
});
