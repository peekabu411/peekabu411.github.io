const $ = (id) => document.getElementById(id);
const pairing = $("pairing");
const remote = $("remote");
const touchAppleTablet = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
const mobilePlatform = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || touchAppleTablet;
remote.dataset.platform = mobilePlatform ? "mobile" : "desktop";
const message = $("message");
let session = localStorage.getItem("turntable-session");
let playback = null;
let state = null;
let currentView = "player";
let refreshTimer = null;
let devicesViewRefreshTimer = null;
let refreshInFlight = false;
let dialStart = null;
let commandPending = false;
let optimisticPlaybackPlaying = null;
let optimisticPlaybackUntil = 0;
const optimisticSettings = new Map();
let repeatOneArmedUri = null;
let repeatOneAutoOffPending = false;
let connectionState = { kind: "waiting", detail: "Waiting for the first playback update.", updatedAt: 0, cacheAge: null };
let diagnosticsRefreshTimer = null;
let artSwipe = null;
let lastFeedbackAt = 0;
let buttonHapticDispatchActive = false;
let barGesture = null;
let pairingInfo = null;
let playlistsLoaded = false;
let playlistsLoading = false;
let playlistLibrary = [];
let playlistOrganizerMode = false;
let playlistTouchDrag = null;
let playlistAutoScrollFrame = 0;
let suppressPlaylistPlayUntil = 0;
const PLAYLIST_ORDER_KEY = "turntable-playlist-order";
const PLAYLIST_PINNED_KEY = "turntable-playlist-pinned";
let devicesLoaded = false;
let devicesLoading = false;
let devicesLastRefreshAt = 0;
let queueLoaded = false;
let queueLoading = false;
let queueRefreshPending = false;
let queueDrawerGesture = null;
let queuedPlayNextTarget = null;
let queuedPlayNextRunning = false;
let queuedPlayNextBoundaryTimer = null;
let observedPlaybackUri = null;
let artworkTransitionActive = false;
let dialVolumeHoldUntil = 0;
let dialTapCount = 0;
let dialTapTimer = null;
let activeBackground = 0;
let currentBackgroundUrl = "";
let backgroundTransitionToken = 0;
let statusRequestSequence = 0;
let renderedStatusSequence = 0;
const legacyTheme = localStorage.getItem("turntable-theme") || "design-1";
let albumStyle = localStorage.getItem("turntable-album-style") || (legacyTheme === "turntable" ? "vinyl" : "square");
let controlStyle = localStorage.getItem("turntable-control-style") || (legacyTheme === "turntable" ? "bar" : "dial");
let displayStyle = localStorage.getItem("turntable-display-style") || "info";
let lyricsBackground = localStorage.getItem("turntable-lyrics-background") || "transparent";
let playerBackgroundStyle = localStorage.getItem("turntable-player-background") || "artwork";
let backgroundColorMode = localStorage.getItem("turntable-background-color-mode") === "manual" ? "manual" : "auto";
let manualBackgroundColor = /^#[0-9a-f]{6}$/i.test(localStorage.getItem("turntable-manual-background-color") || "") ? localStorage.getItem("turntable-manual-background-color") : "#34261f";
let playbackBarStyle = localStorage.getItem("turntable-playback-bar-style") === "divider" ? "divider" : "default";
let guideText = localStorage.getItem("turntable-guide-text") === "hidden" ? "hidden" : "shown";
let controlBarBackground = ["opaque", "translucent", "transparent"].includes(localStorage.getItem("turntable-control-bar-background")) ? localStorage.getItem("turntable-control-bar-background") : "transparent";
let volumeWeight = ["light", "medium", "heavy"].includes(localStorage.getItem("turntable-volume-weight")) ? localStorage.getItem("turntable-volume-weight") : "heavy";
let layoutProfile = ["auto", "compact", "standard", "wide"].includes(localStorage.getItem("turntable-layout-profile")) ? localStorage.getItem("turntable-layout-profile") : "auto";
let uiFontScale = Math.max(90, Math.min(110, Number(localStorage.getItem("turntable-ui-font-scale")) || 100));
let lyricFontScale = Math.max(90, Math.min(130, Number(localStorage.getItem("turntable-lyric-font-scale")) || 110));
let displayedTrackUri = null;
let pendingArtworkUri = null;
let pendingArtworkDirection = null;
let artworkTransitionToken = 0;
let seekDragging = false;
let pendingSeek = null;
let progressFrame = null;
let progressClock = { uri: null, position: 0, duration: 0, startedAt: 0, playing: false, correction: 0, correctionStartedAt: 0, correctionDuration: 0 };
let turntableTrackUri = null;
let vinylSpinAnimation = null;
let vinylSpinRate = 0;
let vinylTargetRate = 0;
let vinylRateFrame = null;
let vinylRateResolver = null;
let vinylTransitionToken = 0;
let vinylTransitionPrepared = false;
let vinylTransitionDirection = "next";
let vinylIncomingSpinAnimation = null;
let requestedNextCover = "";
const artworkPreloads = new Map();
const albumColorCache = new Map();
const lyricsResultCache = new Map();
const lyricsPrefetches = new Map();
let albumColorTrackUri = null;
let lyricsTrackUri = null;
let lyricsRequestToken = 0;
let lyricsLines = [];
let lyricsAvailability = "unknown";
let sideControlGesture = null;
let activeLyricIndex = -1;
let activeLyricWordIndex = -1;
let lyricStyle = localStorage.getItem("turntable-lyric-style") || "scroll";
const storedLyricOffset = localStorage.getItem("turntable-lyric-offset");
const storedLyricOffsetNumber = Number(storedLyricOffset);
const migrateLegacyZeroOffset = localStorage.getItem("turntable-lyric-offset-default-v2") !== "applied" && storedLyricOffsetNumber === 0;
let lyricOffset = Math.max(-1.2, Math.min(-0.2, storedLyricOffset === null || !Number.isFinite(storedLyricOffsetNumber) || migrateLegacyZeroOffset ? -0.7 : storedLyricOffsetNumber));
localStorage.setItem("turntable-lyric-offset-default-v2", "applied");
const VOLUME_WEIGHT_SENSITIVITY = { light: .28, medium: .19, heavy: .12 };
const DIAL_MULTI_TAP_MS = 420;
const SIDE_CONTROL_HIDE_ZONE_START = 0.56;
const ACTIVE_STATUS_REFRESH_MS = 5_000;
const IDLE_STATUS_REFRESH_MS = 15_000;
const ENDING_STATUS_REFRESH_MS = 1_000;
const ENDING_STATUS_WINDOW_MS = 12_000;
const DEVICES_VIEW_REFRESH_MS = 30_000;
const SEEK_CONFIRM_GRACE_MS = 4_000;
const SEEK_CONFIRM_TOLERANCE_MS = 1_500;

const CLIENT_SNAPSHOT_KEY = "turntable-last-playback";
let spotifyPauseUntil = Number(sessionStorage.getItem("turntable-spotify-pause-until")) || 0;
let lastSnapshotSavedAt = 0;

async function api(path, options = {}) {
  const spotifyPath = /^\/api\/(status|devices|queue|playlists|player\/|settings)/.test(path);
  if (spotifyPath && Date.now() < spotifyPauseUntil) {
    const retryAfter = Math.max(1, Math.ceil((spotifyPauseUntil - Date.now()) / 1000));
    throw Object.assign(new Error(`Spotify is cooling down. Trying again in ${retryAfter} seconds.`), { status: 429, retryAfter, localCooldown: true });
  }
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", "x-remote-session": session, ...(options.headers || {}) }
    });
  } catch (error) {
    setConnectionState("offline", "The PC server is unreachable. Showing the last saved playback.");
    throw Object.assign(new Error("The PC remote is offline or unavailable on this network."), { status: 503, cause: error });
  }  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      session = null;
      localStorage.removeItem("turntable-session");
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      remote.hidden = true;
      pairing.hidden = false;
      $("pair-error").textContent = "The server restarted or this pairing expired. Enter your PIN again.";
    }
    const retryAfter = Math.max(0, Number(body.retry_after || response.headers.get("retry-after")) || 0);
    if (response.status === 429 && retryAfter) {
      spotifyPauseUntil = Math.max(spotifyPauseUntil, Date.now() + retryAfter * 1000);
      sessionStorage.setItem("turntable-spotify-pause-until", String(spotifyPauseUntil));
    }
    throw Object.assign(new Error(body.error || "The PC remote did not respond."), { status: response.status, retryAfter });
  }
  return response.status === 204 ? null : response.json();
}

const formatTime = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const artists = (track) => track?.artists?.map((artist) => artist.name).join(", ") || "Unknown artist";
const artwork = (track) => track?.album?.images?.[0]?.url || "";

function saveClientSnapshot(force = false) {
  if (!state?.playback || (!force && Date.now() - lastSnapshotSavedAt < 30_000)) return;
  lastSnapshotSavedAt = Date.now();
  try { localStorage.setItem(CLIENT_SNAPSHOT_KEY, JSON.stringify({ playback: state.playback, queue: state.queue || [], savedAt: Date.now() })); } catch { /* Storage can be unavailable in private mode. */ }
}
function hydrateClientSnapshot() {
  try {
    const cached = JSON.parse(localStorage.getItem(CLIENT_SNAPSHOT_KEY) || "null");
    if (!cached?.playback || Date.now() - cached.savedAt > 24 * 60 * 60 * 1000) return false;
    if (cached.playback.is_playing && Number.isFinite(cached.playback.progress_ms)) {
      cached.playback.progress_ms = Math.min(cached.playback.item?.duration_ms || Infinity, cached.playback.progress_ms + Math.max(0, Date.now() - cached.savedAt));
    }
    state = { playback: cached.playback, queue: Array.isArray(cached.queue) ? cached.queue : [] };
    render({ playback: state.playback, queue: state.queue, connection: { cached: true } });
    renderQueue(state.queue);
    queueLoaded = false; // Render cached queue now, then refresh it once in the background.
    setMessage("Connecting — showing the last known playback.");
    setConnectionState("cached", "Showing the saved playback while the first live update loads.", { updatedAt: cached.savedAt, cacheAge: Date.now() - cached.savedAt });
    return true;
  } catch { return false; }
}

function preloadArtwork(url) {
  if (!url) return Promise.resolve(false);
  if (artworkPreloads.has(url)) return artworkPreloads.get(url);
  const ready = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  artworkPreloads.set(url, ready);
  if (artworkPreloads.size > 18) artworkPreloads.delete(artworkPreloads.keys().next().value);
  return ready;
}
async function showNextCover(url) {
  requestedNextCover = url || "";
  const nextCover = $("next-cover");
  if (!url) { nextCover.removeAttribute("src"); nextCover.style.display = "none"; return; }
  const loaded = await preloadArtwork(url);
  if (requestedNextCover !== url) return;
  nextCover.src = url;
  nextCover.style.display = loaded ? "block" : "none";
}
function createVinylSpinAnimation(element) {
  const animation = element.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 9000, iterations: Infinity, easing: "linear" }
  );
  animation.playbackRate = 0;
  return animation;
}
function ensureVinylSpin(reset = false) {
  if (!vinylSpinAnimation) vinylSpinAnimation = createVinylSpinAnimation($("cover"));
  if (reset) vinylSpinAnimation.currentTime = 0;
  return vinylSpinAnimation;
}
function updateVinylSpinEffect(rate = vinylSpinRate) {
  const speed = Math.max(0, Math.min(1, (Math.abs(rate) - 1) / 6));
  const strength = Math.pow(speed, 1.45);
  $("album-card").style.setProperty("--vinyl-speed-effect", (strength * .62).toFixed(3));
  $("album-card").style.setProperty("--vinyl-transition-softness", (strength * 1.2).toFixed(2) + "px");
}
function rampVinylSpin(targetRate, duration = 1100) {
  const animation = ensureVinylSpin();
  const currentTime = Number(animation.currentTime) || 0;
  if (targetRate < 0 && currentTime < 9000) animation.currentTime = currentTime + 9000;
  vinylTargetRate = targetRate;
  if (vinylRateFrame) cancelAnimationFrame(vinylRateFrame);
  if (vinylRateResolver) vinylRateResolver(false);
  if (Math.abs(vinylSpinRate - targetRate) < .01 || duration <= 0) {
    vinylSpinRate = targetRate;
    animation.playbackRate = targetRate;
    updateVinylSpinEffect(targetRate);
    return Promise.resolve(true);
  }
  const startingRate = vinylSpinRate;
  const startedAt = performance.now();
  return new Promise((resolve) => {
    vinylRateResolver = resolve;
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      vinylSpinRate = startingRate + (targetRate - startingRate) * eased;
      animation.playbackRate = vinylSpinRate;
      updateVinylSpinEffect(vinylSpinRate);
      if (progress < 1) vinylRateFrame = requestAnimationFrame(step);
      else {
        vinylRateFrame = null;
        vinylRateResolver = null;
        vinylSpinRate = targetRate;
        animation.playbackRate = targetRate;
        updateVinylSpinEffect(targetRate);
        resolve(true);
      }
    };
    vinylRateFrame = requestAnimationFrame(step);
  });
}
function setVinylPlaybackState(playing) {
  if (albumStyle !== "vinyl" || artworkTransitionActive) return;
  const target = playing ? 1 : 0;
  if (target === vinylTargetRate) return;
  rampVinylSpin(target, playing ? 1250 : 1650);
}
function resetTurntableRotation(uri) {
  if (!uri || uri === turntableTrackUri) return;
  turntableTrackUri = uri;
  ensureVinylSpin(true);
  vinylSpinRate = 0;
  vinylTargetRate = 0;
  vinylSpinAnimation.playbackRate = 0;
  updateVinylSpinEffect(0);
  setVinylPlaybackState(!!playback?.is_playing);
}
function prepareVinylTransition(direction = "next") {
  if (albumStyle !== "vinyl") return;
  vinylTransitionDirection = direction === "previous" ? "previous" : "next";
  $("album-card").dataset.spinDirection = vinylTransitionDirection;
  const transitionRate = vinylTransitionDirection === "previous" ? -7 : 7;
  artworkTransitionActive = true;
  vinylTransitionPrepared = true;
  $("album-card").classList.add("vinyl-transitioning");
  rampVinylSpin(transitionRate, 380);
}
async function animateVinylAlbumChange(incomingCover, incomingUri) {
  if (albumStyle !== "vinyl" || !incomingCover || !incomingUri) return;
  const token = ++vinylTransitionToken;
  if (!vinylTransitionPrepared) prepareVinylTransition();
  const transitionRate = vinylTransitionDirection === "previous" ? -7 : 7;
  const [artworkReady] = await Promise.all([preloadArtwork(incomingCover), rampVinylSpin(transitionRate, Math.abs(vinylSpinRate) >= 6.5 ? 80 : 360)]);
  if (token !== vinylTransitionToken) return;
  if (!artworkReady) {
    cancelVinylTransition();
    return;
  }
  const cover = $("cover");
  const transitionCover = $("vinyl-transition-cover");
  transitionCover.src = incomingCover;
  transitionCover.style.display = "block";
  await transitionCover.decode().catch(() => {});
  if (token !== vinylTransitionToken) return;
  vinylIncomingSpinAnimation?.cancel();
  vinylIncomingSpinAnimation = createVinylSpinAnimation(transitionCover);
  vinylIncomingSpinAnimation.currentTime = vinylSpinAnimation?.currentTime || 0;
  vinylIncomingSpinAnimation.playbackRate = transitionRate;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  $("album-card").classList.add("vinyl-cover-blending");
  await new Promise((resolve) => setTimeout(resolve, 440));
  if (token !== vinylTransitionToken) return;
  cover.src = incomingCover;
  cover.style.display = "block";
  await cover.decode().catch(() => {});
  $("album-card").classList.add("vinyl-blend-settled");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (token !== vinylTransitionToken) return;
  vinylIncomingSpinAnimation?.cancel();
  vinylIncomingSpinAnimation = null;
  transitionCover.style.display = "none";
  transitionCover.removeAttribute("src");
  $("album-card").classList.remove("vinyl-transitioning", "vinyl-cover-blending", "vinyl-blend-settled", "swiping");
  vinylTransitionPrepared = false;
  vinylTransitionDirection = "next";
  artworkTransitionActive = false;
  turntableTrackUri = incomingUri;
  rampVinylSpin(playback?.is_playing ? 1 : 0, playback?.is_playing ? 1300 : 1650);
  showNextCover(artwork(state?.queue?.[0]));
}
function cancelVinylTransition(originalCover = "") {
  vinylTransitionToken += 1;
  vinylTransitionPrepared = false;
  vinylTransitionDirection = "next";
  artworkTransitionActive = false;
  vinylIncomingSpinAnimation?.cancel();
  vinylIncomingSpinAnimation = null;
  $("vinyl-transition-cover").style.display = "none";
  $("vinyl-transition-cover").removeAttribute("src");
  $("album-card").classList.remove("vinyl-transitioning", "vinyl-cover-blending", "vinyl-blend-settled", "swiping");
  $("cover").classList.remove("vinyl-cover-swap");
  if (originalCover) {
    $("cover").src = originalCover;
    $("cover").style.display = "block";
  }
  rampVinylSpin(playback?.is_playing ? 1 : 0, 900);
}

function clockPosition(now = performance.now()) {
  const elapsed = progressClock.playing ? now - progressClock.startedAt : 0;
  const correctionProgress = progressClock.correctionDuration
    ? Math.min(1, Math.max(0, (now - progressClock.correctionStartedAt) / progressClock.correctionDuration))
    : 1;
  const easedCorrection = correctionProgress * correctionProgress * (3 - 2 * correctionProgress);
  return Math.max(0, Math.min(progressClock.duration, progressClock.position + elapsed + progressClock.correction * easedCorrection));
}
function paintProgress(now = performance.now()) {
  if (seekDragging) return;
  const position = clockPosition(now);
  const seek = $("seek");
  seek.value = position;
  const percent = progressClock.duration ? position / progressClock.duration * 100 : 0;
  seek.style.setProperty("--seek-progress", `${Math.max(0, Math.min(100, percent))}%`);
  $("elapsed").textContent = formatTime(position);
  updateActiveLyrics(position);
}
function animateProgress(now) {
  progressFrame = null;
  paintProgress(now);
  if (progressClock.playing && clockPosition(now) < progressClock.duration) progressFrame = requestAnimationFrame(animateProgress);
}
function startProgressAnimation() {
  if (!progressFrame && progressClock.playing) progressFrame = requestAnimationFrame(animateProgress);
}
function syncProgressClock(player) {
  const now = performance.now();
  const uri = player?.item?.uri || null;
  const duration = player?.item?.duration_ms || 0;
  const serverPosition = Math.max(0, Math.min(duration, player?.progress_ms || 0));
  let confirmedPosition = serverPosition;
  let holdingPendingSeek = false;
  if (pendingSeek) {
    if (pendingSeek.uri !== uri || now >= pendingSeek.expiresAt) pendingSeek = null;
    else {
      const expectedPosition = Math.max(0, Math.min(duration, pendingSeek.position + (player?.is_playing ? now - pendingSeek.startedAt : 0)));
      if (Math.abs(serverPosition - expectedPosition) <= SEEK_CONFIRM_TOLERANCE_MS) pendingSeek = null;
      else {
        confirmedPosition = expectedPosition;
        holdingPendingSeek = true;
      }
    }
  }
  let position = confirmedPosition;
  let correction = 0;
  let correctionDuration = 0;
  if (!holdingPendingSeek && uri && uri === progressClock.uri && player?.is_playing && progressClock.playing) {
    const estimated = clockPosition(now);
    correction = confirmedPosition - estimated;
    position = estimated;
    correctionDuration = Math.max(350, Math.min(1200, Math.abs(correction) * .55));
  }
  progressClock = { uri, position, duration, startedAt: now, playing: !!player?.is_playing, correction, correctionStartedAt: now, correctionDuration };
  $("seek").max = duration || 100;
  $("duration").textContent = formatTime(duration);
  paintProgress(now);
  startProgressAnimation();
}
function fadeBackground(url, immediate = false) {
  if (!url || url === currentBackgroundUrl) return;
  const token = ++backgroundTransitionToken;
  currentBackgroundUrl = url;
  const layers = [$("background-a"), $("background-b")];
  if (immediate || !layers[activeBackground].style.backgroundImage) {
    layers[activeBackground].style.backgroundImage = `url(${JSON.stringify(url)})`;
    layers[activeBackground].classList.add("active");
    return;
  }
  const nextIndex = activeBackground === 0 ? 1 : 0;
  const incoming = layers[nextIndex]; const outgoing = layers[activeBackground];
  incoming.style.backgroundImage = `url(${JSON.stringify(url)})`;
  incoming.classList.remove("active");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== backgroundTransitionToken) return;
    incoming.classList.add("active"); outgoing.classList.remove("active"); activeBackground = nextIndex;
  }));
}

function parseSyncedLyrics(text = "") {
  const parsed = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const stamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    const words = rawLine.replace(/\[[^\]]+\]/g, "").trim() || "…";
    stamps.forEach((stamp) => parsed.push({ time: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000, text: words }));
  });
  return parsed.sort((a, b) => a.time - b.time);
}

function syncDisplayPresentation() {
  const lyricsConfirmed = lyricsAvailability === "available";
  const fallbackToInfo = displayStyle === "lyrics" && !lyricsConfirmed;
  remote.dataset.display = fallbackToInfo ? "info" : displayStyle;
  remote.dataset.lyricsFallback = String(fallbackToInfo);
  if (displayStyle === "lyrics" && lyricsAvailability === "unavailable") $("context").textContent = "LYRICS UNAVAILABLE";
}
function setLyricsAvailability(nextAvailability) {
  lyricsAvailability = nextAvailability;
  syncDisplayPresentation();
  requestAnimationFrame(refreshLyricsTrackMarquee);
}
function renderLyricsLayout() {
  const container = $("lyrics-lines");
  container.replaceChildren();
  container.className = "lyrics-lines";
  activeLyricIndex = -1;
  activeLyricWordIndex = -1;
  const synced = lyricsLines.length > 0 && lyricsLines[0].time != null;
  if (!synced || lyricStyle === "scroll") {
    container.classList.toggle("synced", synced);
    lyricsLines.forEach((row) => {
      const line = document.createElement("p");
      line.textContent = row.text;
      if (row.time == null) line.className = "plain";
      container.append(line);
    });
    return;
  }
  container.classList.add("lyric-stage-mode");
  const stage = document.createElement("p");
  stage.className = `lyric-stage lyric-stage-${lyricStyle}`;
  stage.setAttribute("aria-live", "off");
  container.append(stage);
}

function renderLyrics(result = {}) {
  const container = $("lyrics-lines");
  const status = $("lyrics-status");
  container.replaceChildren();
  container.className = "lyrics-lines";
  lyricsLines = [];
  activeLyricIndex = -1;
  activeLyricWordIndex = -1;
  if (result.instrumental) {
    setLyricsAvailability("unavailable");
    status.hidden = false;
    status.textContent = "Instrumental track";
    return;
  }
  const synced = parseSyncedLyrics(result.syncedLyrics);
  const plain = result.plainLyrics?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) || [];
  const rows = synced.length ? synced : plain.map((text) => ({ time: null, text }));
  if (!result.found || !rows.length) {
    setLyricsAvailability("unavailable");
    status.hidden = false;
    status.textContent = "Lyrics aren't available for this song.";
    return;
  }
  setLyricsAvailability("available");
  status.hidden = true;
  lyricsLines = rows;
  renderLyricsLayout();
  updateActiveLyrics(clockPosition());
}

function lyricsRequestFor(track) {
  const query = new URLSearchParams({
    track_name: track?.name || "",
    artist_name: artists(track),
    album_name: track?.album?.name || "",
    duration: String(Math.round((track?.duration_ms || 0) / 1000))
  });
  return { query, cacheKey: query.toString() };
}
function cacheLyricsResult(cacheKey, result) {
  lyricsResultCache.set(cacheKey, result);
  if (lyricsResultCache.size > 30) lyricsResultCache.delete(lyricsResultCache.keys().next().value);
  return result;
}
async function requestLyricsResult(query) {
  try {
    return await api(`/api/lyrics?${query}`);
  } catch {
    const response = await fetch(`https://lrclib.net/api/get?${query}`, { headers: { "Lrclib-Client": "Turntable LAN Remote v0.1 (local personal project)" } });
    if (response.status === 404) return { found: false, instrumental: false, syncedLyrics: null, plainLyrics: null };
    if (!response.ok) throw new Error("Lyrics provider unavailable");
    const direct = await response.json();
    return { found: true, instrumental: !!direct.instrumental, syncedLyrics: direct.syncedLyrics || null, plainLyrics: direct.plainLyrics || null };
  }
}
function prefetchLyrics(track) {
  if (!track?.uri) return Promise.resolve(null);
  const { query, cacheKey } = lyricsRequestFor(track);
  if (lyricsResultCache.has(cacheKey)) return Promise.resolve(lyricsResultCache.get(cacheKey));
  if (lyricsPrefetches.has(cacheKey)) return lyricsPrefetches.get(cacheKey);
  const request = requestLyricsResult(query)
    .then((result) => cacheLyricsResult(cacheKey, result))
    .finally(() => lyricsPrefetches.delete(cacheKey));
  lyricsPrefetches.set(cacheKey, request);
  return request;
}
async function loadLyrics(track) {
  const token = ++lyricsRequestToken;
  lyricsTrackUri = track?.uri || null;
  activeLyricIndex = -1;
  activeLyricWordIndex = -1;
  lyricsLines = [];
  if (!track) {
    setLyricsAvailability("unavailable");
    $("lyrics-lines").replaceChildren();
    $("lyrics-lines").className = "lyrics-lines";
    $("lyrics-status").hidden = false;
    $("lyrics-status").textContent = "Play a song to see lyrics.";
    return;
  }
  const { cacheKey } = lyricsRequestFor(track);
  if (lyricsResultCache.has(cacheKey)) {
    renderLyrics(lyricsResultCache.get(cacheKey));
    return;
  }
  setLyricsAvailability("loading");
  $("lyrics-lines").replaceChildren();
  $("lyrics-lines").className = "lyrics-lines";
  $("lyrics-status").hidden = false;
  $("lyrics-status").textContent = "Finding lyrics…";
  try {
    const result = await prefetchLyrics(track);
    if (token === lyricsRequestToken && lyricsTrackUri === track.uri) renderLyrics(result);
  } catch {
    if (token === lyricsRequestToken) {
      setLyricsAvailability("unavailable");
      $("lyrics-lines").replaceChildren();
      $("lyrics-status").hidden = false;
      $("lyrics-status").textContent = "Lyrics could not be loaded.";
    }
  }
}
function lyricPosition(position) {
  position -= lyricOffset * 1000;
  let lineIndex = -1;
  for (let index = 0; index < lyricsLines.length && lyricsLines[index].time <= position + 100; index += 1) lineIndex = index;
  if (lineIndex < 0) return { lineIndex, wordIndex: -1, words: [] };
  const line = lyricsLines[lineIndex];
  const words = line.text.trim().split(/\s+/).filter(Boolean);
  const nextStart = lyricsLines[lineIndex + 1]?.time;
  const fallbackEnd = Math.min(progressClock.duration || line.time + 4200, line.time + 4200);
  const lineEnd = Math.max(line.time + 450, nextStart ?? fallbackEnd);
  const progress = Math.max(0, Math.min(.999, (position - line.time) / (lineEnd - line.time)));
  return { lineIndex, wordIndex: Math.min(words.length - 1, Math.floor(progress * words.length)), words };
}

function buildTimedLyricLine(stage, words, wordIndex) {
  stage.replaceChildren();
  if (lyricStyle === "focus") {
    [wordIndex - 1, wordIndex, wordIndex + 1].forEach((index) => {
      if (!words[index]) return;
      const span = document.createElement("span");
      span.textContent = words[index];
      span.className = index === wordIndex ? "current" : "neighbor";
      stage.append(span);
    });
    return;
  }
  words.forEach((word, index) => {
    const span = document.createElement("span");
    span.textContent = `${word}${index < words.length - 1 ? " " : ""}`;
    span.className = index < wordIndex ? "passed" : index === wordIndex ? "current" : "future";
    stage.append(span);
  });
}

function updateActiveLyrics(position) {
  if (displayStyle !== "lyrics" || !lyricsLines.length || lyricsLines[0].time == null) return;
  const { lineIndex, wordIndex, words } = lyricPosition(position);
  if (lyricStyle !== "scroll") {
    if (lineIndex < 0 || !words.length || (lineIndex === activeLyricIndex && wordIndex === activeLyricWordIndex)) return;
    const stage = $("lyrics-lines").querySelector(".lyric-stage");
    if (!stage) return;
    activeLyricIndex = lineIndex;
    activeLyricWordIndex = wordIndex;
    if (lyricStyle === "word") {
      stage.textContent = words[wordIndex] || "";
      stage.animate?.([{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
    } else buildTimedLyricLine(stage, words, wordIndex);
    return;
  }
  if (lineIndex === activeLyricIndex) return;
  const elements = [...$("lyrics-lines").children];
  if (activeLyricIndex >= 0) elements[activeLyricIndex]?.classList.remove("active");
  activeLyricIndex = lineIndex;
  activeLyricWordIndex = -1;
  const active = elements[lineIndex];
  if (!active) return;
  active.classList.add("active");
  const container = $("lyrics-lines");
  const activeCenter = active.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop + active.offsetHeight / 2;
  container.scrollTo({ top: Math.max(0, activeCenter - container.clientHeight * .46), behavior: "smooth" });
}

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
      const response = await fetch(`/api/artwork?url=${encodeURIComponent(url)}`, { headers: { "x-remote-session": session } });
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
    connected: ["Connected", "The phone, PC server, and Spotify playback are synchronized."],
    syncing: ["Syncing", "Applying the latest playback state from Spotify."],
    cached: ["Reconnecting", "Showing the last known playback while Spotify reconnects."],
    cooldown: ["Spotify cooldown", "Playback is cached until Spotify allows another request."],
    offline: ["PC unavailable", "The last saved playback remains visible while the LAN connection recovers."],
    waiting: ["Waiting for Spotify", "Start a song in the desktop Spotify client to synchronize playback."]
  }[kind] || ["Checking connection", "Contacting the PC and Spotify..."];
}
function connectionAction(kind) {
  return {
    connected: "No action needed.",
    syncing: "Keep Spotify open on the PC and allow the update to finish.",
    cached: "Confirm the PC server is running and both devices are on the same Wi-Fi.",
    cooldown: "Wait for the automatic retry and avoid repeatedly pressing Refresh.",
    offline: "Open the Turntable Remote Dashboard, confirm the server says Running, and check that both devices use the same Wi-Fi.",
    waiting: "Play a song in the Spotify desktop app, then press Refresh once."
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
    const data = await api("/api/diagnostics");
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
      const row = document.createElement("li"); row.innerHTML = `<span>${item.path}</span><b>${item.count}</b>`; paths.append(row);
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

const NOW_PLAYING_GUIDE_KEY = "turntable-now-playing-guide-v1";
let nowPlayingGuideStep = -1;
let nowPlayingGuideScheduled = false;
const nowPlayingGuidePages = [
  {
    kicker: "NOW PLAYING · 1 OF 5",
    title: "The record is your skip control",
    copy: "Swipe the album artwork left or right to move through songs. The gesture lives right on the center of the record.",
    visual: '<div class="guide-demo guide-demo-skip-examples"><div class="guide-demo-skip-option"><div class="guide-demo-record-disc"><div class="guide-demo-record-swipe"><i>&larr;</i><b>SWIPE</b><i>&rarr;</i></div></div><small>VINYL</small></div><div class="guide-demo-skip-option"><div class="guide-demo-square-swipe"><div class="guide-demo-record-swipe"><i>&larr;</i><b>SWIPE</b><i>&rarr;</i></div></div><small>SQUARE</small></div></div>'
  },
  {
    kicker: "NOW PLAYING · 2 OF 5",
    title: "Keep playback close",
    copy: "Use the timeline to seek. Play, previous, next, shuffle, repeat, and the queue are always part of the Now Playing deck.",
    visual: '<div class="guide-demo guide-demo-playback"><div class="guide-demo-timeline"><i></i></div><div class="guide-demo-transport"><span>&#8644;</span><span>&#9664;&#9664;</span><b>&#9654;</b><span>&#9654;&#9654;</span><span>&#8635;</span></div><small>PLAYBACK CONTROLS</small></div>'
  },
  {
    kicker: "NOW PLAYING · 3 OF 5",
    title: "Press for tabs. Swipe for volume.",
    copy: "Press the top arrow to reveal the tab row. On the right, swipe either volume control up or down to adjust volume.",
    visual: '<div class="guide-demo guide-demo-clean-player"><div class="guide-clean-tab"><span></span><i>&#8964;</i><b>PRESS TO OPEN TABS</b></div><div class="guide-clean-content"><div class="guide-clean-track"><div class="guide-clean-art"></div><div><b>NOW PLAYING</b><strong>Song title</strong><small>Artist name</small></div></div><div class="guide-clean-volume"><small>VOLUME</small><div class="guide-clean-slider"><i></i><b></b></div><div class="guide-clean-swipe"><i>&uarr;</i><b>SWIPE</b><i>&darr;</i></div></div><div class="guide-clean-dial"><div><b></b><i></i></div></div></div></div>'
  },
  {
    kicker: "NOW PLAYING · 4 OF 5",
    title: "Your tabs are always one press away",
    copy: "The revealed row gives you a direct route to every Turntable page and a quick refresh without leaving the controller.",
    visual: '<div class="guide-demo guide-demo-tab-row"><div class="guide-demo-tab-trigger">&#8963;</div><div class="guide-demo-presets"><b>Now Playing</b><span>Playlists</span><span>Devices</span><span>Settings</span><i aria-label="Refresh">&#8635;</i></div></div>'
  },
  {
    kicker: "NOW PLAYING · 5 OF 5",
    title: "Next: explore each tab",
    copy: "Playlists, Devices, and Settings each have their own visual guide next. You can return to this overview anytime from Settings.",
    visual: '<div class="guide-demo guide-demo-next-tabs"><span>PLAYLISTS</span><span>DEVICES</span><span>SETTINGS</span><small>MORE GUIDES COMING NEXT</small></div>'
  }
];
function openNowPlayingGuide(step = -1) {
  const tour = $("now-playing-guide");
  if (!tour || !session) return;
  switchView("player");
  setTopBarHidden(false);
  nowPlayingGuideStep = step;
  tour.hidden = false;
  renderNowPlayingGuide();
  requestAnimationFrame(() => $("now-playing-guide-card")?.focus());
}
function closeNowPlayingGuide(outcome = "completed") {
  const tour = $("now-playing-guide");
  if (!tour) return;
  tour.hidden = true;
  nowPlayingGuideStep = -1;
  if (outcome) localStorage.setItem(NOW_PLAYING_GUIDE_KEY, outcome);
}
function renderNowPlayingGuide() {
  const guideCard = $("now-playing-guide-card");
  const isWelcome = nowPlayingGuideStep < 0;
  const page = isWelcome ? null : nowPlayingGuidePages[nowPlayingGuideStep];
  $("now-playing-guide-kicker").textContent = isWelcome ? "WELCOME TO TURNTABLE" : page.kicker;
  $("now-playing-guide-title").textContent = isWelcome ? "A quick Now Playing tour" : page.title;
  $("now-playing-guide-count").textContent = isWelcome ? "Overview" : `${nowPlayingGuideStep + 1} / ${nowPlayingGuidePages.length}`;
  $("now-playing-guide-copy").textContent = isWelcome ? "A simple visual guide to the controls on this page. It takes less than a minute, and you can replay it from Settings anytime." : page.copy;
  $("now-playing-guide-visual").innerHTML = isWelcome
    ? '<div class="guide-demo guide-demo-welcome"><div class="guide-demo-welcome-disc"><span></span></div><div><b>NOW PLAYING</b><small>Music, playback, tabs, and volume</small></div></div>'
    : page.visual;
  $("now-playing-guide-back").hidden = isWelcome || nowPlayingGuideStep === 0;
  $("now-playing-guide-dismiss").textContent = isWelcome ? "Not now" : "Skip guide";
  $("now-playing-guide-next").textContent = isWelcome ? "Start guide" : nowPlayingGuideStep === nowPlayingGuidePages.length - 1 ? "Done" : "Next";
  guideCard.scrollTop = 0;
}
function maybeRequestNowPlayingGuide(delay = 900) {
  if (!session || nowPlayingGuideScheduled || localStorage.getItem(NOW_PLAYING_GUIDE_KEY)) return;
  nowPlayingGuideScheduled = true;
  window.setTimeout(() => {
    nowPlayingGuideScheduled = false;
    if (session && !localStorage.getItem(NOW_PLAYING_GUIDE_KEY)) openNowPlayingGuide();
  }, delay);
}
$("now-playing-guide-next").onclick = () => {
  if (nowPlayingGuideStep < 0) { nowPlayingGuideStep = 0; renderNowPlayingGuide(); return; }
  if (nowPlayingGuideStep >= nowPlayingGuidePages.length - 1) { closeNowPlayingGuide("completed"); return; }
  nowPlayingGuideStep += 1;
  renderNowPlayingGuide();
};
$("now-playing-guide-back").onclick = () => { if (nowPlayingGuideStep > 0) { nowPlayingGuideStep -= 1; renderNowPlayingGuide(); } };
$("now-playing-guide-dismiss").onclick = () => closeNowPlayingGuide(nowPlayingGuideStep < 0 ? "dismissed" : "completed");
$("start-now-playing-guide").onclick = () => openNowPlayingGuide();
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

async function loadPairingInfo(force = false) {
  if (pairingInfo && !force) return;
  try {
    pairingInfo = await api("/api/pairing-info");
    $("settings-pin").textContent = pairingInfo.pin;
    $("pair-address").textContent = pairingInfo.urls?.[0] || location.origin;
  } catch (error) { showError(error); }
}

function clearQueuedPlayNextTarget() {
  queuedPlayNextTarget = null;
  if (queuedPlayNextBoundaryTimer) clearTimeout(queuedPlayNextBoundaryTimer);
  queuedPlayNextBoundaryTimer = null;
}

function scheduleQueuedPlayNextBoundaryCheck(delayOverride) {
  if (queuedPlayNextBoundaryTimer) clearTimeout(queuedPlayNextBoundaryTimer);
  queuedPlayNextBoundaryTimer = null;
  if (!queuedPlayNextTarget || queuedPlayNextRunning) return;
  const remaining = playback?.is_playing && progressClock.duration
    ? Math.max(0, progressClock.duration - clockPosition())
    : null;
  const delay = Number.isFinite(delayOverride)
    ? delayOverride
    : remaining === null ? 5_000 : Math.max(750, remaining + 500);
  queuedPlayNextBoundaryTimer = setTimeout(async () => {
    queuedPlayNextBoundaryTimer = null;
    if (!queuedPlayNextTarget || queuedPlayNextRunning) return;
    try {
      const snapshot = await requestStatus(true);
      renderStatusSnapshot(snapshot);
      if (queuedPlayNextTarget && !queuedPlayNextRunning) scheduleQueuedPlayNextBoundaryCheck(1_000);
    } catch {
      if (queuedPlayNextTarget && !queuedPlayNextRunning) scheduleQueuedPlayNextBoundaryCheck(5_000);
    }
  }, Math.max(250, delay));
}

function armQueuedPlayNext(track, index) {
  const selected = queuedPlayNextTarget?.index === index && queuedPlayNextTarget?.uri === track.uri;
  physicalFeedback("press");
  if (selected) {
    clearQueuedPlayNextTarget();
    setMessage("Play Next cancelled.");
  } else {
    queuedPlayNextTarget = {
      uri: track.uri,
      name: track.name || "selected song",
      index,
      advances: index + 1,
      sourceUri: playback?.item?.uri || null,
      armedAt: Date.now()
    };
    preloadArtwork(artwork(track));
    scheduleQueuedPlayNextBoundaryCheck();
    setMessage((track.name || "Selected song") + " will play after " + (index + 1) + " queue advance" + (index ? "s." : "."));
  }
  renderQueue(state?.queue || []);
}

async function advanceToQueuedTarget(incomingUri) {
  if (!queuedPlayNextTarget || queuedPlayNextRunning) return;
  const target = queuedPlayNextTarget;
  queuedPlayNextRunning = true;
  if (queuedPlayNextBoundaryTimer) clearTimeout(queuedPlayNextBoundaryTimer);
  queuedPlayNextBoundaryTimer = null;
  commandPending = true;
  renderQueue(state?.queue || []);
  try {
    let currentUri = incomingUri;
    const remainingSkips = Math.max(0, target.advances - 1);
    if (currentUri !== target.uri && remainingSkips > 0) {
      pendingArtworkUri = target.uri;
      pendingArtworkDirection = "next";
      updateTrackCopy((state?.queue || [])[target.index], null, false);
      fadeBackground(artwork((state?.queue || [])[target.index]));
      setMessage("Skipping " + remainingSkips + " time" + (remainingSkips === 1 ? "" : "s") + " to " + target.name + "...");
      await api("/api/player/skip-count", {
        method: "PUT",
        body: JSON.stringify({ count: remainingSkips, device_id: activeDeviceId() })
      });
      const snapshot = await requestStatus(true);
      renderStatusSnapshot(snapshot);
      currentUri = snapshot.data.playback?.item?.uri || null;
    }
    const reachedTarget = currentUri === target.uri;
    clearQueuedPlayNextTarget();
    if (reachedTarget) {
      setQueueDrawer(false);
      setMessage("Now playing " + target.name + ".");
    } else setMessage("Finished the requested skips, but Spotify's queue no longer matches the saved lineup.");
  } catch (error) {
    clearQueuedPlayNextTarget();
    showError(error);
  } finally {
    queuedPlayNextRunning = false;
    commandPending = false;
    renderQueue(state?.queue || []);
    void loadQueue(true);
    scheduleStatusRefresh(ENDING_STATUS_REFRESH_MS);
  }
}
function renderQueue(queue = []) {
  const list = $("queue-list");
  list.replaceChildren();
  if (!queue.length) {
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Your Spotify queue is empty."; list.append(empty); return;
  }
  queue.forEach((track, index) => {
    preloadArtwork(artwork(track));
    const row = document.createElement("div"); row.className = "queue-item";
    const image = document.createElement("img"); image.src = artwork(track); image.alt = "";
    const copy = document.createElement("div");
    const title = document.createElement("b"); title.textContent = track.name;
    const artist = document.createElement("small"); artist.textContent = artists(track);
    const actions = document.createElement("div"); actions.className = "queue-actions";
    const number = document.createElement("span"); number.className = "queue-number"; number.textContent = String(index + 1).padStart(2, "0");
    const playNext = document.createElement("button"); playNext.type = "button"; playNext.className = "queue-play-next";
    const selected = queuedPlayNextTarget?.uri === track.uri;
    playNext.textContent = selected ? "Cancel" : "Play next";
    playNext.classList.toggle("active", selected);
    playNext.setAttribute("aria-pressed", String(selected));
    playNext.disabled = queuedPlayNextRunning;
    playNext.onclick = () => armQueuedPlayNext(track, index);
    actions.append(number, playNext);
    copy.append(title, artist); row.append(image, copy, actions); list.append(row);
  });
}

async function loadQueue(force = false) {
  if (queueLoading) {
    if (force) queueRefreshPending = true;
    return;
  }
  if (queueLoaded && !force) return;
  queueLoading = true;
  try {
    const result = await api("/api/queue" + (force ? "?force=1" : ""));
    const queue = result.items || [];
    state = { ...(state || {}), queue };
    if (queuedPlayNextTarget && !queuedPlayNextRunning) {
      const updatedIndex = queue.findIndex((track) => track.uri === queuedPlayNextTarget.uri);
      if (updatedIndex >= 0) {
        queuedPlayNextTarget.index = updatedIndex;
        queuedPlayNextTarget.advances = updatedIndex + 1;
      }
    }
    renderQueue(queue);
    queueLoaded = true;
    saveClientSnapshot(true);
    queue.slice(0, 4).forEach((track) => preloadArtwork(artwork(track)));
    if (displayStyle === 'lyrics') void prefetchLyrics(queue[0]);
    showNextCover(artwork(queue[0]));
  } catch (error) { showError(error); }
  finally {
    queueLoading = false;
    if (queueRefreshPending) {
      queueRefreshPending = false;
      void loadQueue(true);
    }
  }
}
function readPlaylistIds(key) {
  try { const saved = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []; }
  catch { return []; }
}
function savePlaylistIds(key, ids) { localStorage.setItem(key, JSON.stringify([...new Set(ids)])); }
function playlistPresentation(playlists) {
  const order = readPlaylistIds(PLAYLIST_ORDER_KEY);
  const pins = new Set(readPlaylistIds(PLAYLIST_PINNED_KEY));
  const positions = new Map(order.map((id, index) => [id, index]));
  const sorted = [...playlists].sort((left, right) => (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  return { pinned: sorted.filter((playlist) => pins.has(playlist.id)), regular: sorted.filter((playlist) => !pins.has(playlist.id)), pins };
}
function setPlaylistPinned(id, pinned) {
  const pins = new Set(readPlaylistIds(PLAYLIST_PINNED_KEY));
  if (pinned) pins.add(id); else pins.delete(id);
  savePlaylistIds(PLAYLIST_PINNED_KEY, [...pins]);
  renderPlaylists(playlistLibrary);
}
function playlistCardPositions() {
  return new Map([...document.querySelectorAll(".playlist-card")].map((card) => [card.dataset.playlistId, card.getBoundingClientRect()]));
}
function animatePlaylistReorder(before) {
  requestAnimationFrame(() => document.querySelectorAll(".playlist-card").forEach((card) => {
    const previous = before.get(card.dataset.playlistId);
    if (!previous) return;
    const next = card.getBoundingClientRect();
    const x = previous.left - next.left;
    const y = previous.top - next.top;
    if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
    card.animate([{ transform: `translate3d(${x}px,${y}px,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }));
}
function movePlaylistBefore(sourceId, targetId, placeAfter = false) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const { pins } = playlistPresentation(playlistLibrary);
  if (pins.has(sourceId) !== pins.has(targetId)) { setMessage("Pin or unpin a playlist before moving it between sections."); return; }
  const before = playlistCardPositions();
  const current = playlistPresentation(playlistLibrary);
  const ordered = [...current.pinned, ...current.regular].map((playlist) => playlist.id);
  const withoutSource = ordered.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  withoutSource.splice(Math.max(0, targetIndex + (placeAfter ? 1 : 0)), 0, sourceId);
  savePlaylistIds(PLAYLIST_ORDER_KEY, withoutSource);
  renderPlaylists(playlistLibrary);
  animatePlaylistReorder(before);
}
function setPlaylistDropGap(card, after) {
  card?.classList.remove("drop-before", "drop-after");
  card?.classList.add(after ? "drop-after" : "drop-before");
}
function stopPlaylistAutoScroll() {
  if (!playlistAutoScrollFrame) return;
  cancelAnimationFrame(playlistAutoScrollFrame);
  playlistAutoScrollFrame = 0;
}
function updatePlaylistAutoScroll(drag, clientY) {
  const view = document.querySelector(".playlist-view");
  if (!view) return;
  const bounds = view.getBoundingClientRect();
  const edge = 82;
  const topDistance = clientY - bounds.top;
  const bottomDistance = bounds.bottom - clientY;
  drag.autoScrollSpeed = topDistance < edge ? -Math.ceil((edge - topDistance) / edge * 15) : bottomDistance < edge ? Math.ceil((edge - bottomDistance) / edge * 15) : 0;
  if (!drag.autoScrollSpeed) { stopPlaylistAutoScroll(); return; }
  if (playlistAutoScrollFrame) return;
  const scroll = () => {
    const activeDrag = playlistTouchDrag;
    if (!activeDrag?.moved || !activeDrag.autoScrollSpeed) { playlistAutoScrollFrame = 0; return; }
    view.scrollTop += activeDrag.autoScrollSpeed;
    playlistAutoScrollFrame = requestAnimationFrame(scroll);
  };
  playlistAutoScrollFrame = requestAnimationFrame(scroll);
}
function clearPlaylistDrag(drag) {
  stopPlaylistAutoScroll();
  if (!drag) return;
  drag.card?.classList.remove("dragging");
  drag.hover?.classList.remove("drop-before", "drop-after");
  drag.preview?.remove();
}
function renderPlaylistCard(playlist, pins) {
  const card = document.createElement("article");
  card.className = "playlist-card";
  card.dataset.playlistId = playlist.id;
  card.draggable = playlistOrganizerMode;
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "playlist-play";
  playButton.setAttribute("aria-label", `Play ${playlist.name}`);
  const cover = document.createElement("span");
  cover.className = "playlist-cover";
  const fallback = document.createElement("span");
  fallback.className = "playlist-fallback";
  fallback.textContent = playlist.name?.trim()?.[0]?.toUpperCase() || "Music";
  if (playlist.image) {
    const image = document.createElement("img");
    image.src = playlist.image;
    image.alt = "";
    image.loading = "lazy";
    fallback.hidden = true;
    image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; });
    cover.append(image, fallback);
  } else cover.append(fallback);
  const name = document.createElement("b");
  name.textContent = playlist.name;
  const detail = document.createElement("small");
  detail.textContent = `${Number.isFinite(playlist.tracks) ? playlist.tracks : 0} songs`;
  playButton.append(cover, name, detail);
  playButton.onclick = () => { if (Date.now() >= suppressPlaylistPlayUntil) playPlaylist(playlist, playButton); };
  card.append(playButton);
  if (playlistOrganizerMode) {
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "playlist-pin";
    pin.setAttribute("aria-label", `${pins.has(playlist.id) ? "Unpin" : "Pin"} ${playlist.name}`);
    pin.textContent = pins.has(playlist.id) ? "Pinned" : "Pin";
    pin.onclick = () => setPlaylistPinned(playlist.id, !pins.has(playlist.id));
    card.append(pin);
  }
  card.addEventListener("dragstart", (event) => {
    if (!playlistOrganizerMode) return;
    const preview = cover.cloneNode(true);
    preview.className = "playlist-drag-preview";
    document.body.append(preview);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", playlist.id);
    event.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);
    requestAnimationFrame(() => preview.remove());
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("dragover", (event) => { if (!playlistOrganizerMode) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setPlaylistDropGap(card, event.clientX > card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2); });
  card.addEventListener("dragleave", () => card.classList.remove("drop-before", "drop-after"));
  card.addEventListener("drop", (event) => { if (!playlistOrganizerMode) return; event.preventDefault(); const placeAfter = card.classList.contains("drop-after"); card.classList.remove("drop-before", "drop-after"); movePlaylistBefore(event.dataTransfer.getData("text/plain"), playlist.id, placeAfter); });
  card.addEventListener("pointerdown", (event) => {
    if (!playlistOrganizerMode || event.pointerType === "mouse" || event.target.closest(".playlist-pin")) return;
    playlistTouchDrag = { id: playlist.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, card, preview: null, hover: null };
    card.setPointerCapture?.(event.pointerId);
  });
  card.addEventListener("pointermove", (event) => {
    const drag = playlistTouchDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.preview = cover.cloneNode(true);
      drag.preview.className = "playlist-drag-preview";
      document.body.append(drag.preview);
      card.classList.add("dragging");
    }
    event.preventDefault();
    updatePlaylistAutoScroll(drag, event.clientY);
    drag.preview.style.transform = `translate3d(${event.clientX - 44}px, ${event.clientY - 44}px, 0) rotate(3deg)`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".playlist-card");
    const nextHover = target && target !== card ? target : null;
    const placeAfter = nextHover ? event.clientX > nextHover.getBoundingClientRect().left + nextHover.getBoundingClientRect().width / 2 : false;
    if (drag.hover && (drag.hover !== nextHover || drag.placeAfter !== placeAfter)) drag.hover.classList.remove("drop-before", "drop-after");
    drag.hover = nextHover;
    drag.placeAfter = placeAfter;
    setPlaylistDropGap(drag.hover, placeAfter);
  });
  card.addEventListener("pointerup", (event) => {
    const drag = playlistTouchDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    playlistTouchDrag = null;
    if (drag.moved) suppressPlaylistPlayUntil = Date.now() + 350;
    const targetId = drag.hover?.dataset.playlistId;
    clearPlaylistDrag(drag);
    if (drag.moved && targetId) movePlaylistBefore(drag.id, targetId, drag.placeAfter);
  });
  card.addEventListener("pointercancel", () => { clearPlaylistDrag(playlistTouchDrag); playlistTouchDrag = null; });
  return card;
}
function renderPlaylists(playlists = []) {
  const grid = $("playlist-grid");
  grid.replaceChildren();
  grid.removeAttribute("aria-busy");
  if (!playlists.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No Spotify playlists were found in your library.";
    grid.append(empty);
    return;
  }
  const { pinned, regular, pins } = playlistPresentation(playlists);
  const appendCards = (items) => items.forEach((playlist) => grid.append(renderPlaylistCard(playlist, pins)));
  if (!playlistOrganizerMode) { appendCards([...pinned, ...regular]); return; }
  const appendSection = (label, items) => {
    if (!items.length) return;
    const heading = document.createElement("p");
    heading.className = "playlist-section-label";
    heading.textContent = label;
    grid.append(heading);
    appendCards(items);
  };
  if (pinned.length) appendSection("PINNED", pinned);
  appendSection(pinned.length ? "ALL PLAYLISTS" : "YOUR PLAYLISTS", regular);
}
async function loadPlaylists(force = false) {
  if (playlistsLoading || (playlistsLoaded && !force)) return;
  playlistsLoading = true;
  const grid = $("playlist-grid");
  grid.setAttribute("aria-busy", "true");
  if (!playlistsLoaded) {
    grid.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "empty";
    loading.textContent = "Loading your Spotify playlists...";
    grid.append(loading);
  }
  try {
    const result = await api("/api/playlists");
    playlistLibrary = result.items || [];
    renderPlaylists(playlistLibrary);
    playlistsLoaded = true;
    setMessage();
  } catch (error) {
    grid.removeAttribute("aria-busy");
    grid.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = error.message;
    grid.append(empty);
    showError(error);
  } finally { playlistsLoading = false; }
}

async function playPlaylist(playlist, button) {
  if (commandPending) return;
  commandPending = true;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  physicalFeedback("press");
  setMessage(`Starting ${playlist.name}...`);
  try {
    await api("/api/player/playlist", {
      method: "PUT",
      body: JSON.stringify({ context_uri: playlist.uri, device_id: activeDeviceId() })
    });
    switchView("player");
    setTopBarHidden(true);
    setMessage();
    setTimeout(() => refresh(true), 650);
    setTimeout(() => loadQueue(true), 900);
  } catch (error) { showError(error); }
  finally {
    commandPending = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function renderDevices(devices = []) {
  const list = $("device-list"); list.replaceChildren();
  if (!devices.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Open Spotify on your PC to make it appear here."; list.append(empty); return; }
  devices.forEach((device) => {
    const row = document.createElement("div"); row.className = `device-item${device.is_active ? " active" : ""}`;
    const icon = document.createElement("span"); icon.className = "device-icon"; icon.textContent = device.type === "Computer" ? "▣" : "◉";
    const copy = document.createElement("div");
    const name = document.createElement("b"); name.textContent = device.name;
    const detail = document.createElement("small"); detail.textContent = `${device.type} · ${device.volume_percent ?? 0}% volume`;
    const button = document.createElement("button"); button.textContent = device.is_active ? "Active" : "Connect"; button.disabled = device.is_active;
    button.onclick = async () => { await setting({ device_id: device.id }); await loadDevices(true); };
    copy.append(name, detail); row.append(icon, copy, button); list.append(row);
  });
}

function refreshDevicesView() {
  const devicesStale = !devicesLastRefreshAt || Date.now() - devicesLastRefreshAt >= DEVICES_VIEW_REFRESH_MS;
  return Promise.allSettled([loadDevices(devicesStale), loadPairingInfo(true)]);
}
function scheduleDevicesViewRefresh(delay = DEVICES_VIEW_REFRESH_MS) {
  if (devicesViewRefreshTimer) clearTimeout(devicesViewRefreshTimer);
  devicesViewRefreshTimer = null;
  if (!session || document.hidden || currentView !== "devices") return;
  devicesViewRefreshTimer = setTimeout(async () => {
    devicesViewRefreshTimer = null;
    await refreshDevicesView();
    scheduleDevicesViewRefresh();
  }, Math.max(0, delay));
}

async function loadDevices(force = false) {
  if (devicesLoading || (devicesLoaded && !force)) return;
  devicesLoading = true;
  try {
    const result = await api(`/api/devices${force ? "?force=1" : ""}`);
    const devices = result.items || [];
    state = { ...(state || {}), devices };
    renderDevices(devices);
    devicesLoaded = true;
    devicesLastRefreshAt = Date.now();
    setConnectionState("connected", "The PC server and Spotify device list responded.", {
      updatedAt: devicesLastRefreshAt,
      cacheAge: connectionState.cacheAge,
    });
  } catch (error) {
    const cooldown = Number(error?.status) === 429;
    setConnectionState(
      cooldown ? "cooldown" : "offline",
      cooldown ? "Spotify is cooling down; cached device information remains available." : "Device refresh failed; cached information remains available.",
    );
    showError(error);
  }
  finally { devicesLoading = false; }
}

function updateVolume(value, send = false) {
  const volume = Math.max(0, Math.min(100, Math.round(value)));
  $("volume").value = volume; $("volume-value").textContent = `${volume}%`; $("dial-value").textContent = volume;
  $("dial").style.setProperty("--rotation", `${-180 + volume * 1.8}deg`);
  $("dial").style.setProperty("--volume", `${volume}%`);
  $("dial").setAttribute("aria-valuenow", volume);
  if (send) setting({ volume_percent: volume }, false);
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
  $("artist").textContent = track ? artists(track) : "Open Spotify on your PC and start a song";
  updateLyricsTrackMarquee(track);
  if (updateContext) $("context").textContent = displayStyle === "lyrics" && lyricsAvailability === "unavailable" ? "LYRICS UNAVAILABLE" : context?.type ? "PLAYING FROM " + context.type.toUpperCase() : "PLAYING FROM YOUR PC";
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
    animateProgrammaticAlbumChange(pendingArtworkDirection || "next", cover);
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
  if (!staleDuringTransition) {
    $("ambient").style.backgroundImage = cover ? `url(${JSON.stringify(cover)})` : "none";
    fadeBackground(cover, !currentBackgroundUrl);
  }
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

  setButtonAvailability($("volume"), playback?.device?.supports_volume === false, "This Spotify device controls its own volume.");
  $("dial").disabled = playback?.device?.supports_volume === false;

}

async function requestStatus(force = false) {
  const sequence = ++statusRequestSequence;
  return { sequence, data: await api(`/api/status${force ? "?force=1" : ""}`) };
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
      setConnectionState(data.playback ? "connected" : "waiting", data.playback ? "Playback is synchronized with the desktop Spotify client." : "Start a song in the desktop Spotify client to synchronize playback.", { updatedAt, cacheAge });
      setMessage();
    }
  } catch (error) {
    if (error.status === 429) {
      const seconds = Math.max(1, error.retryAfter || Math.ceil((spotifyPauseUntil - Date.now()) / 1000));
      setConnectionState("cooldown", `Spotify requested a pause. Retrying in ${seconds} seconds.`);
      setMessage(`Spotify cooldown active — retrying in ${seconds} seconds.`);
    } else {
      setConnectionState("offline", "The PC server or Spotify connection is unavailable. Showing the last saved playback.");
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
function scheduleStatusRefresh(delay = statusRefreshDelay()) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
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
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ position_ms: 0, target_device_id: activeDeviceId() }) });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await api("/api/player/previous", { method: "PUT", body: JSON.stringify({ device_id: activeDeviceId() }) });
    } else await api(`/api/player/${action}`, { method: "PUT", body: JSON.stringify({ device_id: activeDeviceId() }) });
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
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ ...body, target_device_id: body.device_id ? undefined : activeDeviceId() }) });
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
  } finally { commandPending = false; }
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
  if (fullscreenDismissed || fullscreenActive() || remote.hidden || event.target.closest("#fullscreen-prompt,a[href]")) return;
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
  $("pair-error").textContent = "Checking the PC and loading saved playback...";
  try {
    const response = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: $("pin").value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    session = data.session;
    localStorage.setItem("turntable-session", session);
    pairing.hidden = true;
    remote.hidden = false;
    const hydrated = hydrateClientSnapshot();
    if (!hydrated && data.snapshot?.playback) {
      render(data.snapshot);
      renderQueue(data.snapshot.queue || []);
      saveClientSnapshot(true);
    }
    setConnectionState("syncing", "Paired successfully. Checking the latest Spotify playback.");
    switchView("player");
    void startStatusRefreshCycle();
    scheduleFullscreenPrompt(500);
    maybeRequestNowPlayingGuide(750);
  } catch (error) {
    $("pair-error").textContent = error.message;
  } finally {
    pairButton.disabled = false;
    pairButton.textContent = originalLabel;
  }
};$("pin").addEventListener("keydown", (event) => { if (event.key === "Enter") $("pair").click(); });
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => { switchView(button.dataset.view); setTopBarHidden(true); });
if ($("back")) $("back").onclick = () => { switchView("player"); setTopBarHidden(true); };
$("refresh").onclick = async () => {
  const button = $("refresh");
  if (button.classList.contains("refreshing")) return;
  physicalFeedback("press");
  button.classList.add("refreshing");
  button.setAttribute("aria-busy", "true");
  setMessage("Checking the PC server...");
  const stamp = Date.now();
  const fetchFresh = async (url, attempts = 10) => {
    let lastError = new Error("The PC server did not answer.");
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
        if (response.ok) return response;
        lastError = new Error(`PC server returned ${response.status}.`);
      } catch (error) { lastError = error; }
      if (attempt < attempts - 1) {
        setMessage("The server is applying an update. Reconnecting...");
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    throw lastError;
  };
  try {
    const healthResponse = await fetchFresh(`/api/health?app_refresh=${stamp}`);
    const health = await healthResponse.json();
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set("app_refresh", String(stamp));
    nextUrl.hash = "";
    setMessage(`Loading Turntable ${health.version || "update"}...`);
    await fetchFresh(nextUrl.toString());
    setTimeout(() => location.replace(nextUrl.toString()), 100);
  } catch (error) {
    button.classList.remove("refreshing");
    button.setAttribute("aria-busy", "false");
    setConnectionState("offline", "The app update could not be loaded because the PC server did not answer.");
    setMessage(`Refresh failed: ${error.message} Keep the Dashboard running and try again.`);
  }
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
$("bar-handle").onclick = () => { physicalFeedback("press"); setTopBarHidden(!remote.classList.contains("topbar-hidden")); };
document.addEventListener("pointerup", (event) => {
  if (!remote.classList.contains("topbar-hidden") || event.button !== 0 || event.target.closest("button,input,select,a[href],#fullscreen-prompt")) return;
  const handleBounds = $("bar-handle").getBoundingClientRect();
  const insideExpandedHandle = event.clientX >= handleBounds.left - 18 && event.clientX <= handleBounds.right + 18
    && event.clientY >= Math.max(0, handleBounds.top - 64) && event.clientY <= handleBounds.bottom;
  if (!insideExpandedHandle) return;
  physicalFeedback("press");
  setTopBarHidden(false);
});
$("queue-toggle").onclick = () => { physicalFeedback("press"); const opening = !remote.classList.contains("queue-open"); setQueueDrawer(opening); if (opening) loadQueue(); };
$("queue-close").onclick = $("queue-backdrop").onclick = () => setQueueDrawer(false);
$("queue-drawer").addEventListener("pointerdown", (event) => { queueDrawerGesture = { x: event.clientX, y: event.clientY }; });
$("queue-drawer").addEventListener("pointerup", (event) => {
  if (!queueDrawerGesture) return;
  const dx = event.clientX - queueDrawerGesture.x;
  const dy = event.clientY - queueDrawerGesture.y;
  queueDrawerGesture = null;
  if (dx > 55 && Math.abs(dx) > Math.abs(dy)) setQueueDrawer(false);
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
  const shouldHide = !!hidden && remote.dataset.currentView === "player";
  remote.classList.toggle("side-controls-hidden", shouldHide);
  document.querySelector(".dial-rail").setAttribute("aria-hidden", String(shouldHide));
  if (shouldHide) physicalFeedback("press");
}
$("side-control-reveal").onclick = () => {
  physicalFeedback("press");
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
  if (remote.dataset.currentView !== "player") return;
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
  if (mode === "show" && dx < -46 && Math.abs(dx) > Math.abs(dy) * 1.15) {
    physicalFeedback("press");
    setSideControlsHidden(false);
  }
}, true);
remote.addEventListener("pointercancel", () => { sideControlGesture = null; }, true);
$("copy-address").onclick = async () => {
  const address = pairingInfo?.urls?.[0] || location.origin;
  try { await navigator.clipboard.writeText(address); setMessage("LAN address copied."); }
  catch { setMessage(`Open ${address} on the other phone.`); }
};
$("unpair-phone").onclick = () => { physicalFeedback("press"); localStorage.removeItem("turntable-session"); location.reload(); };

const screen = document.querySelector(".screen");
screen.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button,input,a[href],.album-art,.dial")) return;
  if (sideControlGesture) return;
  if (remote.classList.contains("side-controls-hidden") && remote.dataset.currentView === "player" && event.clientX >= innerWidth * (2 / 3)) return;
  if (event.clientX <= innerWidth * .24 || event.clientX >= innerWidth * .76) return;
  screen.setPointerCapture(event.pointerId); barGesture = { y: event.clientY, dy: 0 };
});
screen.addEventListener("pointermove", (event) => { if (barGesture) barGesture.dy = event.clientY - barGesture.y; });
screen.addEventListener("pointerup", () => {
  if (!barGesture) return;
  if (barGesture.dy > 42) { physicalFeedback("press"); setTopBarHidden(false); }
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
  }
  else if (dialStart.pressZone) {
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
async function animateProgrammaticAlbumChange(direction, incomingCover) {
  if (albumStyle !== "square" || !incomingCover || artworkTransitionActive) return;
  const token = ++artworkTransitionToken;
  artworkTransitionActive = true;
  $("next-cover").src = incomingCover;
  $("next-cover").style.display = "block";
  artStage.classList.add("promote-next");
  fadeBackground(incomingCover);
  requestAnimationFrame(() => {
    albumCard.classList.add(direction === "previous" ? "swipe-commit-right" : "swipe-commit-left");
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (token !== artworkTransitionToken) return;
  $("cover").src = incomingCover;
  $("cover").style.display = "block";
  albumCard.classList.add("swipe-reset");
  albumCard.classList.remove("swipe-commit-left", "swipe-commit-right");
  artStage.classList.remove("promote-next");
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
