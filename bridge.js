(() => {
  const API = "https://api.spotify.com/v1", ACCOUNTS = "https://accounts.spotify.com", KEY = "turntable-ios-oauth";
  const nativeFetch = window.fetch.bind(window);
  const telemetry = { startedAt: Date.now(), events: [] };
  const recordRequest = path => { telemetry.events.push({ at: Date.now(), path: path.split("?")[0] }); if (telemetry.events.length > 250) telemetry.events.splice(0, telemetry.events.length - 250); };
  const read = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const save = value => localStorage.setItem(KEY, JSON.stringify(value));
  const redirectUri = new URL("./", location.href).href;
  const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const error = (message, status = 400) => response({ error: message }, status);
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = async verifier => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  async function accessToken() {
    const auth = read();
    if (!auth.refresh_token) throw new Error("Connect Spotify first.");
    if (auth.expires_at > Date.now() + 45_000) return auth.access_token;
    const r = await nativeFetch(`${ACCOUNTS}/api/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: auth.client_id, grant_type: "refresh_token", refresh_token: auth.refresh_token }) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error_description || "Spotify sign-in expired.");
    save({ ...auth, ...data, refresh_token: data.refresh_token || auth.refresh_token, expires_at: Date.now() + data.expires_in * 1000 }); return data.access_token;
  }
  async function spotify(path, options = {}) {
    recordRequest(path);
    const r = await nativeFetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${await accessToken()}`, ...(options.headers || {}) } });
    if (r.status === 204) return null; const data = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(data.error?.message || `Spotify returned ${r.status}.`), { status: r.status }); return data;
  }
  async function authorize(clientId) {
    const verifier = random(), state = random(); sessionStorage.setItem("tt.verifier", verifier); sessionStorage.setItem("tt.state", state); save({ ...read(), client_id: clientId });
    const query = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, state, scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative", code_challenge_method: "S256", code_challenge: await challenge(verifier) });
    location.assign(`${ACCOUNTS}/authorize?${query}`);
  }
  async function callback() {
    const query = new URLSearchParams(location.search), code = query.get("code"); if (!code) return;
    const auth = read(), verifier = sessionStorage.getItem("tt.verifier"); if (!verifier || query.get("state") !== sessionStorage.getItem("tt.state")) throw new Error("Spotify sign-in could not be verified.");
    document.body.innerHTML = "<main style='font:16px system-ui;padding:2rem;background:#050505;color:#fff'>Connecting Turntable to Spotify…</main>";
    const r = await nativeFetch(`${ACCOUNTS}/api/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: auth.client_id, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error_description || "Spotify sign-in failed."); save({ ...auth, ...data, expires_at: Date.now() + data.expires_in * 1000 }); localStorage.setItem("turntable-session", "github-pages"); document.body.innerHTML = `<main class="return-shell"><section class="return-card"><div class="return-brand"><img src="./icons/turntable-remote-192.png" alt=""><b>turntable</b></div><p class="return-kicker">SPOTIFY CONNECTION</p><div class="return-record"><span></span></div><h1>Connected.</h1><p>Your Spotify account is ready on this device. Return to Turntable to control what is playing.</p><a href="${redirectUri}" class="return-action">Return to Turntable <i>→</i></a><small>You can also close this page and open the Turntable Home Screen icon.</small></section></main>`;
  }
  async function route(path, options = {}) {
    const body = options.body ? JSON.parse(options.body) : {};
    if (path === "/api/pair") { const id = body.pin?.trim(); if (!id) return error("Paste your Spotify Client ID."); await authorize(id); return response({}); }
    if (path.startsWith("/api/status")) return response({ playback: await spotify("/me/player"), connection: { fresh: true, cached: false, updated_at: Date.now() } });
    if (path.startsWith("/api/devices")) return response({ items: (await spotify("/me/player/devices"))?.devices || [] });
    if (path.startsWith("/api/queue")) return response({ items: (await spotify("/me/player/queue"))?.queue?.slice(0, 6) || [] });
    if (path === "/api/playlists") { const data = await spotify("/me/playlists?limit=50"); return response({ items: (data.items || []).filter(Boolean).map(p => ({ id:p.id, uri:p.uri, name:p.name, description:p.description || "", image:p.images?.[0]?.url || "", owner:p.owner?.display_name || "Spotify", tracks:p.items?.total ?? p.tracks?.total })) }); }
    if (path.startsWith("/api/lyrics")) { const q = path.split("?")[1] || ""; const r = await nativeFetch(`https://lrclib.net/api/get?${q}`); if (r.status === 404) return response({ found:false, instrumental:false, syncedLyrics:null, plainLyrics:null }); if (!r.ok) return new Response(await r.text(), { status:r.status, headers:{"Content-Type":"application/json"} }); const lyrics = await r.json(); return response({ found:true, instrumental:!!lyrics.instrumental, syncedLyrics:lyrics.syncedLyrics || null, plainLyrics:lyrics.plainLyrics || null }); }
    if (path.startsWith("/api/artwork")) return nativeFetch(new URL(path, location.href).searchParams.get("url"));
    if (path === "/api/pairing-info") return response({ address: location.origin + location.pathname, pin: "This device" });
    if (path === "/api/diagnostics") { const now = Date.now(); const lastMinute = telemetry.events.filter(event => event.at >= now - 60_000); const lastHour = telemetry.events.filter(event => event.at >= now - 3_600_000); const paths = {}; for (const event of lastHour) paths[event.path] = (paths[event.path] || 0) + 1; return response({ requests: { last_minute: lastMinute.length, last_hour: lastHour.length, cache_hits_since_start: 0, total_since_start: telemetry.events.length, top_paths: Object.entries(paths).sort((a,b) => b[1] - a[1]).slice(0,5).map(([path,count]) => ({ path, count })) }, connection: { state: "direct", cooldown_seconds: 0, playback_cache_age_seconds: 0 }, uptime_seconds: Math.floor((now - telemetry.startedAt) / 1000) }); }
    if (path === "/api/player/playlist") { await spotify(`/me/player/play${body.device_id ? `?device_id=${encodeURIComponent(body.device_id)}` : ""}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({context_uri:body.context_uri}) }); return response(null,204); }
    if (path === "/api/player/skip-count") { for(let i=0;i<body.count;i++) await spotify(`/me/player/next${body.device_id ? `?device_id=${encodeURIComponent(body.device_id)}` : ""}`, {method:"POST"}); return response({ requested:body.count, completed:body.count }); }
    if (path.startsWith("/api/player/")) { const action = path.split("/").pop(), endpoint = action === "next" || action === "previous" ? `/me/player/${action}` : `/me/player/${action}`; await spotify(`${endpoint}${body.device_id ? `?device_id=${encodeURIComponent(body.device_id)}` : ""}`, {method: action === "next" || action === "previous" ? "POST" : "PUT"}); return response(null,204); }
    if (path === "/api/settings") { const target = body.target_device_id ? `&device_id=${encodeURIComponent(body.target_device_id)}` : ""; if(Number.isFinite(body.position_ms)) await spotify(`/me/player/seek?position_ms=${Math.round(body.position_ms)}${target}`,{method:"PUT"}); if(Number.isFinite(body.volume_percent)) await spotify(`/me/player/volume?volume_percent=${Math.round(body.volume_percent)}${target}`,{method:"PUT"}); if(typeof body.shuffle === "boolean") await spotify(`/me/player/shuffle?state=${body.shuffle}${target}`,{method:"PUT"}); if(body.repeat) await spotify(`/me/player/repeat?state=${body.repeat}${target}`,{method:"PUT"}); if(body.device_id) await spotify("/me/player",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({device_ids:[body.device_id],play:true})}); return response(null,204); }
    if (path.startsWith("/api/health")) return response({version:"GitHub Pages"}); return error("Unsupported local route.",404);
  }
  window.fetch = async (input, options) => { const url = new URL(typeof input === "string" ? input : input.url, location.href); if (url.pathname.startsWith("/api/")) { try { return await route(url.pathname + url.search, options); } catch (e) { return error(e.message, e.status || 500); } } return nativeFetch(input, options); };
  function load(src) { return new Promise((resolve,reject) => { const s=document.createElement("script"); s.src=src; s.onload=resolve; s.onerror=reject; document.body.append(s); }); }
  document.getElementById("copy-redirect-uri")?.addEventListener("click", async () => {
    const value = "https://peekabu411.github.io/";
    try { await navigator.clipboard.writeText(value); } catch { window.prompt("Copy this Redirect URI:", value); return; }
    const button = document.getElementById("copy-redirect-uri"); button.textContent = "Copied"; setTimeout(() => { button.textContent = "Copy URL"; }, 1800);
  });
  callback().then(async () => { if (new URLSearchParams(location.search).has("code")) return; await load("./app.js?v=I.9.7.19-rebuilt-player-guide"); await load("./settings-help.js"); await load("./preset-controls.js"); }).catch(e => { document.body.innerHTML = `<main style='font:16px system-ui;padding:2rem;background:#050505;color:#fff'>${e.message}</main>`; });
})();





