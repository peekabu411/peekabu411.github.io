(() => {
  const API = "https://api.spotify.com/v1", ACCOUNTS = "https://accounts.spotify.com", KEY = "turntable-ios-oauth";
  const nativeFetch = window.fetch.bind(window);
  const REQUEST_WARNING_LIMIT = 30, REQUEST_WARNING_WINDOW_MS = 60_000;
  const LIKED_SONGS_ID = "turntable:liked-songs";
  const LIKED_SONGS_FALLBACK_LIMIT = 100;
  const LIKED_SONGS_CACHE_MS = 5 * 60_000;
  const telemetry = { startedAt: Date.now(), events: [], lastMinuteCount: 0 };
  let likedSongsSummaryCache = null;
  const trackLikes = new Map();
  let spotifyUserId = null;
  const recordRequest = path => {
    const now = Date.now();
    telemetry.events.push({ at: now, path: path.split("?")[0] });
    if (telemetry.events.length > 250) telemetry.events.splice(0, telemetry.events.length - 250);
    const recentCount = telemetry.events.filter(event => event.at >= now - REQUEST_WARNING_WINDOW_MS).length;
    const crossedWarningThreshold = telemetry.lastMinuteCount <= REQUEST_WARNING_LIMIT && recentCount > REQUEST_WARNING_LIMIT;
    telemetry.lastMinuteCount = recentCount;
    if (crossedWarningThreshold) window.dispatchEvent(new CustomEvent("turntable:api-rate-warning", { detail: { count: recentCount, waitSeconds: 60 } }));
  };
  let authGeneration = 0;
  let refreshInFlight = null;
  const unauthorized = message => Object.assign(new Error(message), { status: 401 });
  function clearPendingAuthorization() {
    sessionStorage.removeItem("tt.verifier");
    sessionStorage.removeItem("tt.state");
  }
  function disconnect() {
    authGeneration++;
    refreshInFlight = null;
    localStorage.removeItem(KEY);
    localStorage.removeItem("turntable-session");
    localStorage.removeItem("turntable-last-playback");
    clearPendingAuthorization();
    likedSongsSummaryCache = null;
    trackLikes.clear();
    spotifyUserId = null;
  }
  const read = () => {
    try {
      const auth = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!auth || typeof auth !== "object" || Array.isArray(auth)) throw new Error("Invalid connection data.");
      return auth;
    } catch {
      disconnect();
      return {};
    }
  };
  window.turntableAuth = Object.freeze({ disconnect });
  window.addEventListener("storage", event => {
    if ((event.key === KEY && !event.newValue) || event.key === null) {
      disconnect();
      location.reload();
    }
  });
  const save = value => localStorage.setItem(KEY, JSON.stringify(value));
  const redirectUri = new URL("./", location.href).href;
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = async verifier => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  async function accessToken() {
    const auth = read();
    if (!auth.refresh_token) throw unauthorized("Connect Spotify first.");
    if (auth.access_token && auth.expires_at > Date.now() + 45_000) return auth.access_token;
    if (refreshInFlight) return refreshInFlight;
    const generation = authGeneration;
    const pending = (async () => {
      const r = await nativeFetch(`${ACCOUNTS}/api/token`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: auth.client_id, grant_type: "refresh_token", refresh_token: auth.refresh_token }) });
      const data = await r.json();
      if (generation !== authGeneration || !read().refresh_token) throw unauthorized("Connect Spotify first.");
      if (!r.ok) {
        if (data.error === "invalid_grant") { disconnect(); throw unauthorized("Spotify sign-in expired. Connect again."); }
        throw new Error(data.error_description || "Spotify sign-in expired.");
      }
      save({ ...auth, ...data, refresh_token: data.refresh_token || auth.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
      return data.access_token;
    })();
    refreshInFlight = pending;
    try { return await pending; }
    finally { if (refreshInFlight === pending) refreshInFlight = null; }
  }
  async function spotify(path, options = {}) {
    const generation = authGeneration;
    const token = await accessToken();
    if (generation !== authGeneration) throw unauthorized("Connect Spotify first.");
    recordRequest(path);
    const r = await nativeFetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    if (r.status === 204) return null; const data = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(data.error?.message || `Spotify returned ${r.status}.`), { status: r.status, retryAfter: Number(r.headers.get("retry-after")) || 0 }); return data;
  }
  const failure = (message, status, extra = {}) => Object.assign(new Error(message), { status, ...extra });
  const SONG_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
  const missingScope = (auth, scope) => typeof auth.scope === "string" && !auth.scope.split(/\s+/).includes(scope);
  // Reads (saved === undefined) or changes (saved = true/false) whether a song is in Liked Songs.
  async function trackLibrary(uri, saved) {
    const writing = saved !== undefined;
    if (!SONG_URI.test(uri || "")) throw failure("Only Spotify songs can be added to Liked Songs.", 400);
    if (writing && typeof saved !== "boolean") throw failure("Choose whether to save or remove the song.", 400);
    const generation = authGeneration;
    await accessToken(); // Authenticate even when returning a cached library status.
    if (generation !== authGeneration) throw unauthorized("Connect Spotify first.");
    const auth = read();
    if (missingScope(auth, writing ? "user-library-modify" : "user-library-read")) {
      throw failure("Approve Spotify library access once to use Liked Songs.", 403, { needsReconnect: true });
    }
    const cached = trackLikes.get(uri);
    if (!writing && cached && Date.now() - cached.at < 60_000) {
      return { uri, saved: cached.saved, needs_reconnect: missingScope(auth, "user-library-modify") };
    }
    try {
      const query = `?uris=${encodeURIComponent(uri)}`;
      const result = await spotify(writing ? `/me/library${query}` : `/me/library/contains${query}`, writing ? { method: saved ? "PUT" : "DELETE" } : {});
      if (generation !== authGeneration) throw unauthorized("Connect Spotify first.");
      if (!writing && (!Array.isArray(result) || typeof result[0] !== "boolean")) throw new Error("Spotify could not confirm this song's library status.");
      const latest = trackLikes.get(uri);
      const nowSaved = writing ? saved : (latest && latest !== cached ? latest.saved : result[0]);
      trackLikes.set(uri, { saved: nowSaved, at: Date.now() });
      if (trackLikes.size > 100) trackLikes.delete(trackLikes.keys().next().value);
      if (writing) likedSongsSummaryCache = null;
      return { uri, saved: nowSaved, needs_reconnect: missingScope(auth, "user-library-modify") };
    } catch (cause) {
      if (cause.status === 403 && /scope|permission/i.test(cause.message)) throw failure("Approve Spotify library access once to use Liked Songs.", 403, { needsReconnect: true });
      throw cause;
    }
  }
  function likedSongsCard(total = null, options = {}) {
    return {
      id: LIKED_SONGS_ID,
      type: "liked-songs",
      uri: null,
      name: "Liked Songs",
      description: "Tracks saved to your Spotify library.",
      image: "",
      owner: "Your Library",
      tracks: Number.isFinite(total) ? total : null,
      needs_reconnect: !!options.needsReconnect,
      temporarily_unavailable: !!options.temporarilyUnavailable
    };
  }
  async function likedSongsSummary() {
    if (likedSongsSummaryCache && Date.now() - likedSongsSummaryCache.updatedAt <= LIKED_SONGS_CACHE_MS) {
      return likedSongsCard(likedSongsSummaryCache.total);
    }
    try {
      const data = await spotify("/me/tracks?limit=1");
      const total = Number.isFinite(data.total) ? data.total : (data.items || []).length;
      likedSongsSummaryCache = { updatedAt: Date.now(), total };
      return likedSongsCard(total);
    } catch (error) {
      likedSongsSummaryCache = null;
      if (error.status === 403) return likedSongsCard(null, { needsReconnect: true });
      return likedSongsCard(null, { temporarilyUnavailable: true });
    }
  }
  async function currentSpotifyUserId() {
    if (spotifyUserId) return spotifyUserId;
    const user = await spotify("/me");
    spotifyUserId = user?.id || null;
    if (!spotifyUserId) throw Object.assign(new Error("Spotify could not identify this account."), { status: 502 });
    return spotifyUserId;
  }
  async function likedSongsFallback() {
    const first = await spotify("/me/tracks?limit=50&offset=0");
    const total = Number.isFinite(first.total) ? first.total : (first.items || []).length;
    const items = [...(first.items || [])];
    if (total > 50) items.push(...((await spotify("/me/tracks?limit=50&offset=50")).items || []));
    const uris = items.slice(0, LIKED_SONGS_FALLBACK_LIMIT).map(item => item?.track?.uri).filter(uri => typeof uri === "string" && uri.startsWith("spotify:track:"));
    if (!uris.length) throw Object.assign(new Error("Your Liked Songs library is empty."), { status: 409 });
    likedSongsSummaryCache = { updatedAt: Date.now(), total };
    return { uris, total };
  }
  async function playLikedSongs(body) {
    const path = `/me/player/play${body.device_id ? `?device_id=${encodeURIComponent(body.device_id)}` : ""}`;
    if (likedSongsSummaryCache?.total === 0) throw Object.assign(new Error("Your Liked Songs library is empty."), { status: 409 });
    try {
      const userId = await currentSpotifyUserId();
      await spotify(path, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({context_uri:`spotify:user:${userId}:collection`}) });
      return { mode: "collection", total: likedSongsSummaryCache?.total ?? null, limited: false };
    } catch (error) {
      if (![400, 403, 404, 500].includes(error.status)) throw error;
    }
    try {
      const fallback = await likedSongsFallback();
      await spotify(path, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({uris:fallback.uris}) });
      return { mode: "uris", played_count: fallback.uris.length, total: fallback.total, limited: fallback.uris.length < fallback.total };
    } catch (error) {
      if (error.status === 403 && /scope|permission/i.test(error.message)) throw Object.assign(new Error("Reconnect Spotify from the setup screen once to enable Liked Songs."), { status: 403 });
      throw error;
    }
  }
  async function authorize(clientId) {
    const auth = read();
    authGeneration++;
    refreshInFlight = null;
    const verifier = random(), state = random(); sessionStorage.setItem("tt.verifier", verifier); sessionStorage.setItem("tt.state", state); save({ ...auth, client_id: clientId });
    trackLikes.clear();
    const query = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, state, scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-library-modify user-read-private", code_challenge_method: "S256", code_challenge: await challenge(verifier) });
    location.assign(`${ACCOUNTS}/authorize?${query}`);
  }
  async function callback() {
    const query = new URLSearchParams(location.search), code = query.get("code");
    if (!code && !query.has("error")) return false;
    const verifier = sessionStorage.getItem("tt.verifier"), expectedState = sessionStorage.getItem("tt.state");
    clearPendingAuthorization();
    const cleanUrl = new URL(location.href);
    for (const key of ["code", "state", "error", "error_description"]) cleanUrl.searchParams.delete(key);
    history.replaceState(null, "", cleanUrl.href);
    if (!verifier || !expectedState || query.get("state") !== expectedState) throw new Error("Spotify sign-in could not be verified.");
    if (query.has("error")) throw new Error("Spotify sign-in was cancelled or denied. Return to Turntable and connect again.");
    const auth = read(), generation = authGeneration;
    showConnectionMessage("Connecting Turntable to Spotify…");
    const r = await nativeFetch(`${ACCOUNTS}/api/token`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: auth.client_id, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }) });
    const data = await r.json();
    if (generation !== authGeneration) throw unauthorized("Connection cancelled. Connect Spotify again.");
    if (!r.ok) throw new Error(data.error_description || "Spotify sign-in failed.");
    save({ client_id: auth.client_id, ...data, expires_at: Date.now() + data.expires_in * 1000 });
    localStorage.setItem("turntable-session", "github-pages");
    document.body.innerHTML = '<main class="return-shell"><section class="return-card"><div class="return-brand"><img src="./icons/turntable-remote-192.png" alt=""><b>turntable</b></div><p class="return-kicker">SPOTIFY CONNECTION</p><div class="return-record"><span></span></div><h1>Connected.</h1><p>Your Spotify account is ready on this device. Return to Turntable to control what is playing.</p><a class="return-action">Return to Turntable <i>→</i></a><small>You can also close this page and open the Turntable Home Screen icon.</small></section></main>';
    document.querySelector(".return-action").href = redirectUri;
    return true;
  }
  function showConnectionMessage(message) {
    const main = document.createElement("main");
    main.className = "connection-message";
    main.textContent = message;
    document.body.replaceChildren(main);
  }
  const onDevice = deviceId => deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  const putJson = body => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const playlistCard = p => ({ id: p.id, type: "playlist", uri: p.uri, name: p.name, description: p.description || "", image: p.images?.[0]?.url || "", owner: p.owner?.display_name || "Spotify", tracks: p.items?.total ?? p.tracks?.total });
  async function lyrics({ query = "", recordId = null } = {}) {
    const source = recordId && /^\d+$/.test(String(recordId)) ? "https://lrclib.net/api/get/" + recordId : "https://lrclib.net/api/get?" + query;
    const r = await nativeFetch(source);
    if (r.status === 404) return { found: false, instrumental: false, syncedLyrics: null, plainLyrics: null };
    if (!r.ok) throw failure("Lyrics provider unavailable", r.status);
    const found = await r.json();
    return { found: true, instrumental: !!found.instrumental, syncedLyrics: found.syncedLyrics || null, plainLyrics: found.plainLyrics || null };
  }
  function diagnostics() {
    const now = Date.now();
    const lastMinute = telemetry.events.filter(event => event.at >= now - 60_000);
    const lastHour = telemetry.events.filter(event => event.at >= now - 3_600_000);
    const paths = {};
    for (const event of lastHour) paths[event.path] = (paths[event.path] || 0) + 1;
    return {
      requests: { last_minute: lastMinute.length, last_hour: lastHour.length, cache_hits_since_start: 0, total_since_start: telemetry.events.length, top_paths: Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count })) },
      connection: { state: "direct", cooldown_seconds: 0, playback_cache_age_seconds: 0 },
      uptime_seconds: Math.floor((now - telemetry.startedAt) / 1000)
    };
  }
  // The one place the app talks to Spotify. Every method returns plain data or throws an
  // Error carrying `status` (and `retryAfter` / `needsReconnect` when Spotify gives them).
  window.turntableSpotify = Object.freeze({
    async connect(clientId) {
      const id = String(clientId || "").trim();
      if (!id) throw failure("Paste your Spotify Client ID.", 400);
      await authorize(id);
    },
    async reauthorize() {
      const id = read().client_id;
      if (!id) throw failure("Reconnect from the setup screen to enable Liked Songs.", 403);
      await authorize(id);
    },
    async status() { return { playback: await spotify("/me/player"), connection: { fresh: true, cached: false, updated_at: Date.now() } }; },
    async devices() { return { items: (await spotify("/me/player/devices"))?.devices || [] }; },
    async queue() { return { items: (await spotify("/me/player/queue"))?.queue?.slice(0, 6) || [] }; },
    async playlists() {
      const data = await spotify("/me/playlists?limit=50");
      const liked = await likedSongsSummary();
      return { items: [liked, ...(data.items || []).filter(Boolean).map(playlistCard)] };
    },
    // action: "play" | "pause" | "next" | "previous"
    async player(action, deviceId) {
      if (!["play", "pause", "next", "previous"].includes(action)) throw failure("Unsupported playback action.", 400);
      await spotify(`/me/player/${action}${onDevice(deviceId)}`, { method: action === "next" || action === "previous" ? "POST" : "PUT" });
      return null;
    },
    async playPlaylist(contextUri, deviceId) { await spotify(`/me/player/play${onDevice(deviceId)}`, putJson({ context_uri: contextUri })); return null; },
    playLikedSongs: (deviceId) => playLikedSongs({ device_id: deviceId }),
    async skip(count, deviceId) {
      for (let i = 0; i < count; i++) await spotify(`/me/player/next${onDevice(deviceId)}`, { method: "POST" });
      return { requested: count, completed: count };
    },
    // { position_ms, volume_percent, shuffle, repeat, target_device_id } change the current device;
    // { device_id } moves playback to another device.
    async settings(body = {}) {
      const target = body.target_device_id ? `&device_id=${encodeURIComponent(body.target_device_id)}` : "";
      if (Number.isFinite(body.position_ms)) await spotify(`/me/player/seek?position_ms=${Math.round(body.position_ms)}${target}`, { method: "PUT" });
      if (Number.isFinite(body.volume_percent)) await spotify(`/me/player/volume?volume_percent=${Math.round(body.volume_percent)}${target}`, { method: "PUT" });
      if (typeof body.shuffle === "boolean") await spotify(`/me/player/shuffle?state=${body.shuffle}${target}`, { method: "PUT" });
      if (body.repeat) await spotify(`/me/player/repeat?state=${body.repeat}${target}`, { method: "PUT" });
      if (body.device_id) await spotify("/me/player", putJson({ device_ids: [body.device_id], play: true }));
      return null;
    },
    trackSaved: uri => trackLibrary(uri),
    setTrackSaved: (uri, saved) => trackLibrary(uri, saved),
    lyrics,
    diagnostics: async () => diagnostics()
  });
  function load(src) { return new Promise((resolve,reject) => { const s=document.createElement("script"); s.async=false; s.src=src; s.onload=resolve; s.onerror=reject; document.body.append(s); }); }
  document.getElementById("copy-redirect-uri")?.addEventListener("click", async () => {
    const value = "https://peekabu411.github.io/";
    try { await navigator.clipboard.writeText(value); } catch { window.prompt("Copy this Redirect URI:", value); return; }
    const button = document.getElementById("copy-redirect-uri"); button.textContent = "Copied"; setTimeout(() => { button.textContent = "Copy URL"; }, 1800);
  });
  // Download every app script at once; async=false still runs them in this order.
  const APP_SCRIPTS = ["./settings-schema.js?v=I.10.5", "./app/core.js?v=I.10.5", "./app/artwork.js?v=I.10.5", "./app/lyrics.js?v=I.10.5", "./app/shell.js?v=I.10.5", "./app/queue.js?v=I.10.5", "./app/playlists.js?v=I.10.5", "./app/devices.js?v=I.10.5", "./app/player.js?v=I.10.5", "./app/controls.js?v=I.10.5", "./viewport-resume.js?v=I.10.5", "./track-likes.js?v=I.10.5", "./control-bar.js?v=I.10.5", "./now-playing-tour.js?v=I.10.5", "./settings-help.js?v=I.10.5", "./settings-nav.js?v=I.10.5", "./preset-controls.js?v=I.10.5"];
  callback().then(async handled => { if (handled) return; await Promise.all(APP_SCRIPTS.map(load)); }).catch(e => { showConnectionMessage(e.message || "Turntable could not start."); });
})();





