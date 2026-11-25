// Shared state, the Spotify call wrapper (api) and the saved playback snapshot.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
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
const savedSettings = window.turntableSettings.read();
let albumStyle = savedSettings.album;
let controlStyle = savedSettings.control;
let displayStyle = savedSettings.display;
let lyricsBackground = savedSettings.lyricsBackground;
let playerBackgroundStyle = savedSettings.playerBackground;
let backgroundColorMode = savedSettings.backgroundColorMode;
let manualBackgroundColor = savedSettings.manualBackgroundColor;
let playbackBarStyle = savedSettings.playbackBar;
let guideText = savedSettings.guides;
let controlBarBackground = savedSettings.controlBarBackground;
let volumeWeight = savedSettings.volumeWeight;
let layoutProfile = savedSettings.layoutProfile;
let uiFontScale = savedSettings.uiFontScale;
let lyricFontScale = savedSettings.lyricFontScale;
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
const LRCLIB_TRACK_RECORD_OVERRIDES = new Map([
  ["spotify:track:08PQgCL2WTNuMKAnbKC9jV", 11006398]
]);
let albumColorTrackUri = null;
let lyricsTrackUri = null;
let lyricsRequestToken = 0;
let lyricsLines = [];
let lyricsAvailability = "unknown";
let sideControlGesture = null;
let activeLyricIndex = -1;
let activeLyricWordIndex = -1;
let lyricStyle = savedSettings.lyricStyle;
let lyricOffset = savedSettings.lyricOffset;
const VOLUME_WEIGHT_SENSITIVITY = { light: .28, medium: .19, heavy: .12 };
const DIAL_MULTI_TAP_MS = 420;
const SIDE_CONTROL_HIDE_ZONE_START = 0.56;
const ACTIVE_STATUS_REFRESH_MS = 7_500;
const IDLE_STATUS_REFRESH_MS = 15_000;
const ENDING_STATUS_REFRESH_MS = 2_000;
const ENDING_STATUS_WINDOW_MS = 3_000;
const DEVICES_VIEW_REFRESH_MS = 30_000;
const SEEK_CONFIRM_GRACE_MS = 4_000;
const SEEK_CONFIRM_TOLERANCE_MS = 1_500;

const CLIENT_SNAPSHOT_KEY = "turntable-last-playback";
let spotifyPauseUntil = Number(sessionStorage.getItem("turntable-spotify-pause-until")) || 0;
let lastSnapshotSavedAt = 0;

// Runs one Spotify call from bridge.js (window.turntableSpotify) with the app's shared
// handling: a local cool-down after Spotify rate-limits us, sign-out on 401, offline state.
// Pass { cooldown: false } for calls that are not Spotify playback/library requests.
async function api(call, { cooldown = true } = {}) {
  if (cooldown && Date.now() < spotifyPauseUntil) {
    const retryAfter = Math.max(1, Math.ceil((spotifyPauseUntil - Date.now()) / 1000));
    throw Object.assign(new Error(`Spotify is cooling down. Trying again in ${retryAfter} seconds.`), { status: 429, retryAfter, localCooldown: true });
  }
  try {
    return await call(window.turntableSpotify);
  } catch (error) {
    if (error instanceof TypeError) {
      setConnectionState("offline", "Spotify is unreachable. Showing the last saved playback.");
      throw Object.assign(new Error("Spotify could not be reached. Check your internet connection."), { status: 503, cause: error });
    }
    const status = error.status || 500;
    if (status === 401) {
      session = null;
      localStorage.removeItem("turntable-session");
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      remote.hidden = true;
      pairing.hidden = false;
      $("pair-error").textContent = "Your Spotify connection expired. Connect Spotify again.";
    }
    const retryAfter = Math.max(0, Number(error.retryAfter) || 0);
    if (status === 429 && retryAfter) {
      spotifyPauseUntil = Math.max(spotifyPauseUntil, Date.now() + retryAfter * 1000);
      sessionStorage.setItem("turntable-spotify-pause-until", String(spotifyPauseUntil));
    }
    throw Object.assign(new Error(error.message || "Spotify did not respond."), { status, retryAfter, needsReconnect: !!error.needsReconnect });
  }
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
