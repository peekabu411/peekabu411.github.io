// Now Playing: volume, playback buttons, track text, status refresh cycle, playback actions and fullscreen.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
function updateVolume(value, send = false) {
  const volume = Math.max(0, Math.min(100, Math.round(value)));
  $("volume").value = volume; $("volume-value").textContent = `${volume}%`; $("dial-value").textContent = volume;
  $("dial").style.setProperty("--rotation", `${-180 + volume * 1.8}deg`);
  $("dial").style.setProperty("--volume", `${volume}%`);
  $("dial").setAttribute("aria-valuenow", volume);
  if (send) setting({ volume_percent: volume }, false);
}
// The volume control hides itself while the active Spotify device cannot take volume changes
// (Spotify reports supports_volume: false, as it does when the iPhone or iPad itself is playing:
// the phone keeps its own volume and a web app cannot change it). It uses the same tucked-away
// layout as swiping the control away, and comes back when playback moves to a device that can.
let sideControlsUserHidden = false;
let volumeUnavailable = false;
function applySideControlsVisibility() {
  const hide = volumeUnavailable || (sideControlsUserHidden && remote.dataset.currentView === "player");
  remote.classList.toggle("side-controls-hidden", hide);
  remote.classList.toggle("volume-unavailable", volumeUnavailable);
  document.querySelector(".dial-rail").setAttribute("aria-hidden", String(hide));
}
function setVolumeUnavailable(unavailable) {
  if (volumeUnavailable === !!unavailable) return;
  volumeUnavailable = !!unavailable;
  applySideControlsVisibility();
}
function dialVolumeFromDrag(clientY, start) {
  const sensitivity = VOLUME_WEIGHT_SENSITIVITY[volumeWeight] || VOLUME_WEIGHT_SENSITIVITY.heavy;
  return Math.max(0, Math.min(100, start.volume + (start.y - clientY) * sensitivity));
}

function paintPlaybackButton(playing) {
  $("play").innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("dial").setAttribute("aria-label", (playing ? "Pause" : "Play") + "; swipe vertically for volume");
}
function paintRepeatButton(repeatState = "off") {
  const state = ["context", "track"].includes(repeatState) ? repeatState : "off";
  const button = $("repeat");
  button.dataset.repeatState = state;
  button.classList.toggle("active", state !== "off");
  button.setAttribute("aria-label", state === "track" ? "Repeat one enabled for one replay" : state === "context" ? "Repeat all enabled" : "Repeat off");
}
async function completeRepeatOneCycle(uri) {
  if (!uri || repeatOneAutoOffPending || repeatOneArmedUri !== uri) return;
  repeatOneAutoOffPending = true;
  repeatOneArmedUri = null;
  setOptimisticSetting("repeat", "off", 5_000);
  paintRepeatButton("off");
  const applied = await setting({ repeat: "off" });
  repeatOneAutoOffPending = false;
  if (applied) setMessage("Repeat One completed. Repeat is now off.");
}
function optimisticPlaybackDisplay(serverPlaying) {
  if (optimisticPlaybackPlaying === null) return serverPlaying;
  if (serverPlaying === optimisticPlaybackPlaying || performance.now() >= optimisticPlaybackUntil) {
    optimisticPlaybackPlaying = null;
    optimisticPlaybackUntil = 0;
    return serverPlaying;
  }
  return optimisticPlaybackPlaying;
}

function refreshLyricsTrackMarquee() {
  const marquee = $("lyrics-track-marquee");
  const text = $("lyrics-track-marquee-text");
  if (!marquee || !text) return;
  marquee.classList.remove("is-overflowing");
  const overflow = Math.ceil(text.scrollWidth - marquee.clientWidth);
  marquee.style.setProperty("--lyrics-marquee-shift", `${-Math.max(0, text.scrollWidth + 34)}px`);
  if (overflow <= 2) return;
  void text.offsetWidth;
  marquee.classList.add("is-overflowing");
}
function updateLyricsTrackMarquee(track) {
  const text = $("lyrics-track-marquee-text");
  if (!text) return;
  const label = track ? `${track.name || "Unknown title"} — ${artists(track)}` : "";
  if (text.textContent !== label) text.textContent = label;
  text.dataset.loopText = label;
  requestAnimationFrame(refreshLyricsTrackMarquee);
}

function updateTrackCopy(track, context = playback?.context, updateContext = true) {
  const title = $("title");
  const nextTitle = track?.name || "Nothing playing";
  if (title.textContent !== nextTitle) {
    title.textContent = nextTitle;
    title.scrollTop = 0;
  }
  $("artist").textContent = track ? artists(track) : "Open Spotify on any device and start a song";
  updateLyricsTrackMarquee(track);
  if (updateContext) $("context").textContent = displayStyle === "lyrics" && lyricsAvailability === "unavailable" ? "LYRICS NOT AVAILABLE" : context?.type ? "PLAYING FROM " + context.type.toUpperCase() : "NOW PLAYING";
}

function spotifyTrackUrl(track) {
  const direct = track?.external_urls?.spotify;
  if (typeof direct === "string" && /^https:\/\/open\.spotify\.com\//i.test(direct)) return direct;
  const match = /^spotify:track:([^:]+)$/i.exec(track?.uri || "");
  return match ? `https://open.spotify.com/track/${encodeURIComponent(match[1])}` : "https://open.spotify.com/";
}
function updateSpotifyTrackLink(track) {
  const link = $("spotify-track-link");
  if (!link) return;
  const available = /^spotify:track:/i.test(track?.uri || "") || !!track?.external_urls?.spotify;
  const label = available && track?.name ? `Open ${track.name} in Spotify` : "Open Spotify";
  link.href = spotifyTrackUrl(track);
  link.setAttribute("aria-label", label);
  link.title = label;
  link.classList.toggle("track-available", available);
}

function previewQueuedTrack(track = state?.queue?.[0]) {
  if (!track) return false;
  pendingArtworkUri = track.uri || null;
  updateTrackCopy(track, null, false);
  return true;
}
function render(data) {
  const previousObservedUri = observedPlaybackUri;
  const previousRemaining = progressClock.duration ? Math.max(0, progressClock.duration - clockPosition()) : Infinity;
  state = { ...(state || {}), ...data }; playback = state.playback; const track = playback?.item;
  updateSpotifyTrackLink(track);
  window.turntableLikes?.syncTrack(track);
  remote.classList.toggle("is-playing", !!playback?.is_playing);


  const cover = artwork(track);
  const incomingUri = track?.uri || null;
  const observedUriChanged = !!(previousObservedUri && incomingUri && previousObservedUri !== incomingUri);
  const repeatedTrackBoundary = !!(!pendingSeek && previousObservedUri && incomingUri === previousObservedUri && previousRemaining <= 6_000 && Number(playback?.progress_ms || 0) < 6_000);
  const playbackBoundary = observedUriChanged || repeatedTrackBoundary;
  const naturalPlaybackBoundary = playbackBoundary && previousRemaining <= 6_000;
  if (incomingUri) observedPlaybackUri = incomingUri;
  if (displayStyle === "lyrics" && lyricsTrackUri !== incomingUri) loadLyrics(track);
  if (displayStyle === "lyrics" || playerBackgroundStyle === "solid") updateAlbumColor(cover, incomingUri);
  const trackChanged = !!(displayedTrackUri && incomingUri && displayedTrackUri !== incomingUri);
  const transitionWasRequested = pendingArtworkUri === incomingUri;
  const staleDuringTransition = !!(!trackChanged && (artworkTransitionActive || (pendingArtworkUri && incomingUri && pendingArtworkUri !== incomingUri)));
  if (!staleDuringTransition) updateTrackCopy(track, playback?.context);
  if (trackChanged && albumStyle === "vinyl") {
    displayedTrackUri = incomingUri;
    animateVinylAlbumChange(cover, incomingUri);
  } else if (trackChanged && albumStyle === "square" && !artworkTransitionActive && !transitionWasRequested) {
    displayedTrackUri = incomingUri;
    animateProgrammaticAlbumChange(pendingArtworkDirection || "next", cover, { automatic: naturalPlaybackBoundary });
  } else {
    if (!artworkTransitionActive) {
      $("cover").src = cover;
      $("cover").style.display = cover ? "block" : "none";
    }
    if (incomingUri) displayedTrackUri = incomingUri;
    if (albumStyle === "vinyl" && !artworkTransitionActive) resetTurntableRotation(incomingUri);
  }
  if (transitionWasRequested || (trackChanged && pendingArtworkUri)) pendingArtworkUri = null;
  if (trackChanged) pendingArtworkDirection = null;
  // Keep the album atmosphere in sync even while the card animation is still settling.
  $("ambient").style.backgroundImage = cover ? `url(${JSON.stringify(cover)})` : "none";
  fadeBackground(cover, !currentBackgroundUrl);
  if (!artworkTransitionActive) {
    state.queue?.slice(0, 4).forEach((queuedTrack) => preloadArtwork(artwork(queuedTrack)));
    if (displayStyle === 'lyrics') void prefetchLyrics(state.queue?.[0]);
    showNextCover(artwork(state.queue?.[0]));
  }
  paintPlaybackButton(optimisticPlaybackDisplay(!!playback?.is_playing));
  syncProgressClock(playback);
  setVinylPlaybackState(!!playback?.is_playing);
  if (queuedPlayNextTarget && !queuedPlayNextRunning && playbackBoundary) {
    const expectedForwardUri = state?.queue?.[0]?.uri || null;
    const forwardQueueBoundary = !!(incomingUri && expectedForwardUri && incomingUri === expectedForwardUri);
    if (naturalPlaybackBoundary || forwardQueueBoundary) void advanceToQueuedTarget(incomingUri);
    else {
      clearQueuedPlayNextTarget();
      renderQueue(state?.queue || []);
      setMessage("Play Next cancelled because playback moved outside the saved queue.");
    }
  }
  if (queuedPlayNextTarget && !queuedPlayNextRunning && !playbackBoundary) scheduleQueuedPlayNextBoundaryCheck();
  if (trackChanged) void loadQueue(true);
  if (!dialStart && performance.now() > dialVolumeHoldUntil) updateVolume(playback?.device?.volume_percent ?? Number($("volume").value));
  const displayedShuffle = optimisticSettingValue("shuffle", !!playback?.shuffle_state);
  $("shuffle").classList.toggle("active", displayedShuffle);
  window.turntableSmartMix?.syncPlayback(playback, displayedShuffle, data?.connection?.cached === true);
  const displayedRepeat = optimisticSettingValue("repeat", playback?.repeat_state || "off");
  paintRepeatButton(displayedRepeat);
  if (displayedRepeat === "track" && incomingUri && !repeatOneAutoOffPending && repeatOneArmedUri !== incomingUri) repeatOneArmedUri = incomingUri;
  if (displayedRepeat !== "track" && !repeatOneAutoOffPending) repeatOneArmedUri = null;
  if (repeatedTrackBoundary && displayedRepeat === "track" && repeatOneArmedUri === incomingUri) void completeRepeatOneCycle(incomingUri);
  setButtonAvailability($("play"), playback?.is_playing ? disallowed("pausing") : disallowed("resuming"), "Spotify has disabled this action for the current item.");
  setButtonAvailability($("previous"), disallowed("skipping_prev"), "Previous is unavailable for this item.");
  setButtonAvailability($("next"), disallowed("skipping_next"), "Next is unavailable for this item.");
  setButtonAvailability($("seek"), disallowed("seeking"), "Seeking is unavailable for this item.");
  setButtonAvailability($("shuffle"), disallowed("toggling_shuffle"), "Shuffle is unavailable for this context.");

  setButtonAvailability($("repeat"), displayedRepeat === "off" ? disallowed("toggling_repeat_context") : displayedRepeat === "track" ? disallowed("toggling_repeat_track") : disallowed("toggling_repeat_context") && disallowed("toggling_repeat_track"), "Repeat is unavailable for the current context.");

  const volumeLocked = playback?.device?.supports_volume === false;
  setButtonAvailability($("volume"), volumeLocked, "This Spotify device controls its own volume.");
  $("dial").disabled = volumeLocked;
  setVolumeUnavailable(volumeLocked);

}

async function requestStatus(force = false) {
  const sequence = ++statusRequestSequence;
  return { sequence, data: await api(spotify => spotify.status()) };
}

function renderStatusSnapshot(snapshot) {
  if (snapshot.sequence < renderedStatusSequence) return false;
  renderedStatusSequence = snapshot.sequence;
  render(snapshot.data);
  return true;
}

async function refresh(force = false) {
  if (!force && (document.hidden || currentView !== "player")) return;
  if (Date.now() < spotifyPauseUntil) {
    const seconds = Math.max(1, Math.ceil((spotifyPauseUntil - Date.now()) / 1000));
    setConnectionState("cooldown", `Spotify requested a pause. Retrying in ${seconds} seconds.`);
    setMessage(`Spotify cooldown active — retrying in ${seconds} seconds.`);
    return;
  }
  if (refreshInFlight) return;
  refreshInFlight = true;
  setConnectionState("syncing", "Checking the latest Spotify playback state.");
  try {
    const snapshot = await requestStatus(force);
    if (!renderStatusSnapshot(snapshot)) return;
    const data = snapshot.data;
    saveClientSnapshot();
    const updatedAt = Number(data.connection?.updated_at) || Date.now();
    const cacheAge = Math.max(0, Date.now() - updatedAt);
    if (data.connection?.retry_after > 0) {
      spotifyPauseUntil = Math.max(spotifyPauseUntil, Date.now() + data.connection.retry_after * 1000);
      sessionStorage.setItem("turntable-spotify-pause-until", String(spotifyPauseUntil));
      setConnectionState("cooldown", `Spotify requested a pause. Retrying in ${data.connection.retry_after} seconds.`, { updatedAt, cacheAge });
      setMessage(`Spotify cooldown active — retrying in ${data.connection.retry_after} seconds.`);
    } else if (data.connection?.cached) {
      setConnectionState("cached", data.connection?.last_error?.message || "Showing the last known playback while Spotify reconnects.", { updatedAt, cacheAge });
      setMessage("Spotify is reconnecting — showing the last known playback.");
    } else {
      setConnectionState(data.playback ? "connected" : "waiting", data.playback ? "Playback is synchronized with Spotify." : "Start a song in Spotify on any device to synchronize playback.", { updatedAt, cacheAge });
      setMessage();
    }
  } catch (error) {
    if (error.status === 429) {
      const seconds = Math.max(1, error.retryAfter || Math.ceil((spotifyPauseUntil - Date.now()) / 1000));
      setConnectionState("cooldown", `Spotify requested a pause. Retrying in ${seconds} seconds.`);
      setMessage(`Spotify cooldown active — retrying in ${seconds} seconds.`);
    } else {
      setConnectionState("offline", "Spotify is unavailable. Showing the last saved playback.");
      setMessage("Reconnecting — the last known playback remains available.");
    }
  } finally { refreshInFlight = false; }
}function statusRefreshDelay() {
  const cooldown = spotifyPauseUntil - Date.now();
  if (cooldown > 0) return cooldown + 250;
  if (!playback?.is_playing) return IDLE_STATUS_REFRESH_MS;
  const remaining = Math.max(0, progressClock.duration - clockPosition());
  if (progressClock.duration && remaining <= ENDING_STATUS_WINDOW_MS) return ENDING_STATUS_REFRESH_MS;
  if (progressClock.duration) return Math.min(ACTIVE_STATUS_REFRESH_MS, Math.max(ENDING_STATUS_REFRESH_MS, remaining - ENDING_STATUS_WINDOW_MS));
  return ACTIVE_STATUS_REFRESH_MS;
}
function clearScheduledStatusRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}
function scheduleStatusRefresh(delay = statusRefreshDelay()) {
  clearScheduledStatusRefresh();
  if (!session || document.hidden || currentView !== "player") return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refresh();
    scheduleStatusRefresh();
  }, Math.max(0, delay));
}
async function startStatusRefreshCycle() {
  await refresh();
  loadQueue();
  scheduleStatusRefresh();
}
async function playerAction(action, options = {}) {
  if (commandPending) {
    if (options.queueIfBusy) setTimeout(() => playerAction(action, options), 180);
    return;
  }
  commandPending = true; setMessage();
  clearScheduledStatusRefresh();
  const beforeTrack = playback?.item;
  const beforeContext = playback?.context;
  const beforeUri = beforeTrack?.uri;
  const beforeCover = artwork(beforeTrack);
  const beforePlaying = playback?.is_playing;
  if (action === "play" || action === "pause") {
    optimisticPlaybackPlaying = action === "play";
    optimisticPlaybackUntil = performance.now() + 2500;
    paintPlaybackButton(optimisticPlaybackPlaying);
  }
  try {
    if (["next", "previous"].includes(action) && albumStyle === "square") pendingArtworkDirection = action;
    if (["next", "previous"].includes(action) && albumStyle === "vinyl") prepareVinylTransition(action);
    if (action === "next") {
      const queuedTrack = state?.queue?.[0];
      const queuedCover = artwork(queuedTrack);
      previewQueuedTrack(queuedTrack);
      fadeBackground(queuedCover);
      if (albumStyle === "square" && queuedCover && !artworkTransitionActive) {
        animateProgrammaticAlbumChange("next", queuedCover);
      }
    }
    if (action === "previous" && options.forceTrackChange) {
      await api(spotify => spotify.settings({ position_ms: 0, target_device_id: activeDeviceId() }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      await api(spotify => spotify.player("previous", activeDeviceId()));
    } else await api(spotify => spotify.player(action, activeDeviceId()));
    await new Promise((resolve) => setTimeout(resolve, 650));
    const statusSnapshot = await requestStatus(true);
    const nextState = statusSnapshot.data;
    renderStatusSnapshot(statusSnapshot);
    scheduleStatusRefresh();
    const trackChanged = nextState.playback?.item?.uri !== beforeUri;
    if (["next", "previous"].includes(action)) loadQueue(true);
    if (["next", "previous"].includes(action) && !trackChanged) {
      pendingArtworkUri = null;
      pendingArtworkDirection = null;
      updateTrackCopy(beforeTrack, beforeContext);
      if (albumStyle === "square") {
        artworkTransitionToken += 1;
        artworkTransitionActive = false;
        resetAlbumCard();
        $("cover").src = beforeCover;
        $("cover").style.display = beforeCover ? "block" : "none";
      }
      if (albumStyle === "vinyl") cancelVinylTransition(beforeCover);
      fadeBackground(beforeCover);
    }
  } catch (error) {
    if (action === "play" || action === "pause") {
      optimisticPlaybackPlaying = null;
      optimisticPlaybackUntil = 0;
      paintPlaybackButton(!!beforePlaying);
    }
    pendingArtworkUri = null;
    pendingArtworkDirection = null;
    updateTrackCopy(beforeTrack, beforeContext);
    if (["next", "previous"].includes(action) && albumStyle === "square") {
      artworkTransitionToken += 1;
      artworkTransitionActive = false;
      resetAlbumCard();
      $("cover").src = beforeCover;
      $("cover").style.display = beforeCover ? "block" : "none";
    }
    if (["next", "previous"].includes(action) && albumStyle === "vinyl") cancelVinylTransition(beforeCover);
    if (["next", "previous"].includes(action)) fadeBackground(beforeCover);
    showError(error); await refresh();
  }
  finally { commandPending = false; }
}
async function setting(body, refreshAfter = true) {
  if (commandPending) return false;
  commandPending = true; setMessage();
  clearScheduledStatusRefresh();
  try {
    await api(spotify => spotify.settings({ ...body, target_device_id: body.device_id ? undefined : activeDeviceId() }));
    if (refreshAfter) {
      const settleDelay = Number.isFinite(body.position_ms) ? 650 : 250;
      await new Promise((resolve) => setTimeout(resolve, settleDelay));
      await refresh();
    }
    return true;
  } catch (error) {
    if (Number.isFinite(body.position_ms)) pendingSeek = null;
    if (typeof body.shuffle === "boolean") optimisticSettings.delete("shuffle");
    if (typeof body.repeat === "string") optimisticSettings.delete("repeat");
    showError(error);
    await refresh();
    return false;
  } finally {
    commandPending = false;
    scheduleStatusRefresh();
  }
}
const fullscreenPrompt = $("fullscreen-prompt");
const fullscreenEnter = $("fullscreen-enter");
const fullscreenDismiss = $("fullscreen-dismiss");
let fullscreenPromptTimer = null;
let fullscreenRequestPending = false;
let fullscreenDismissed = sessionStorage.getItem("turntable-fullscreen-dismissed") === "true";

function appDisplayMode() {
  return navigator.standalone === true || matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches;
}
function fullscreenActive() {
  return appDisplayMode() || !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function fullscreenRequestAvailable() {
  const target = document.documentElement;
  return typeof (target.requestFullscreen || target.webkitRequestFullscreen) === "function";
}
function hideFullscreenPrompt() {
  clearTimeout(fullscreenPromptTimer);
  fullscreenPrompt.hidden = true;
}
function configureFullscreenPrompt() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (fullscreenRequestAvailable()) {
    $("fullscreen-title").textContent = "Use the complete display";
    $("fullscreen-copy").textContent = "Enter fullscreen to hide browser controls and prevent accidental page zoom.";
    fullscreenEnter.textContent = "Enter fullscreen";
    return "request";
  }
  $("fullscreen-title").textContent = ios ? "Add Turntable to Home Screen" : "Open Turntable as an app";
  $("fullscreen-copy").textContent = ios
    ? "Open the browser Share menu, choose Add to Home Screen, then launch Turntable from its icon."
    : "Use the browser menu and choose Install app or Add to Home screen for the cleanest fullscreen view.";
  fullscreenEnter.textContent = "Continue";
  return "instructions";
}
function showFullscreenPrompt() {
  if (remote.hidden || fullscreenActive() || fullscreenDismissed) return;
  configureFullscreenPrompt();
  fullscreenPrompt.hidden = false;
}
function scheduleFullscreenPrompt(delay = 900) {
  clearTimeout(fullscreenPromptTimer);
  if (remote.hidden || fullscreenActive() || fullscreenDismissed) return;
  fullscreenPromptTimer = setTimeout(showFullscreenPrompt, delay);
}
async function requestAppFullscreen(fromGesture = false) {
  if (fullscreenActive()) { hideFullscreenPrompt(); return true; }
  const target = document.documentElement;
  const request = target.requestFullscreen || target.webkitRequestFullscreen;
  if (typeof request !== "function") {
    if (!fromGesture) showFullscreenPrompt();
    else scheduleFullscreenPrompt(180);
    return false;
  }
  if (fullscreenRequestPending) return false;
  fullscreenRequestPending = true;
  try {
    await request.call(target);
    hideFullscreenPrompt();
    try { await screen.orientation?.lock?.("landscape"); } catch {}
    return true;
  } catch {
    $("fullscreen-copy").textContent = "The browser blocked automatic fullscreen. Press Enter fullscreen to continue.";
    fullscreenPrompt.hidden = false;
    return false;
  } finally {
    fullscreenRequestPending = false;
  }
}
