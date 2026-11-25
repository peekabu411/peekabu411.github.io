// Smart Mix: a Smart Shuffle stand-in. Spotify's Web API cannot turn on Smart Shuffle and no
// longer gives these apps recommendations, so while Turntable is open it adds one of the
// listener's own songs to the Spotify queue every few songs. Hold Shuffle for the menu, which
// also links to the Spotify app for the real Smart Shuffle.
(() => {
  const shuffle = document.getElementById("shuffle");
  if (!shuffle) return;
  const STORAGE_KEY = "turntable-smart-mix", HISTORY_KEY = "turntable-smart-mix-history";
  const PICK_EVERY = 3;                    // One pick after every 3 songs, like Spotify's own mix.
  const HOLD_MS = 450;
  const HISTORY_MS = 24 * 60 * 60_000;     // A pick is not repeated within a day.
  const RECENT_SKIP_MS = 3 * 60 * 60_000;  // Songs heard in the last 3 hours are not picked.
  const POOL_MS = 30 * 60_000;
  const QUEUE_RETRY_MS = 20_000;
  const SOURCES = ["artist", "top", "liked", "recent"];

  let enabled = localStorage.getItem(STORAGE_KEY) === "on";
  let lastUri = null, songsSincePick = 0, pendingPick = null, pendingAge = 0;
  let queueBusy = false, retryAt = 0, sourceTurn = 0, needsReconnect = false;
  let lastPlayback = null;
  const pools = new Map();

  function readHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
      const now = Date.now(), fresh = {};
      for (const [uri, at] of Object.entries(raw && typeof raw === "object" ? raw : {})) if (Number(at) > now - HISTORY_MS) fresh[uri] = Number(at);
      return fresh;
    } catch { return {}; }
  }
  function remember(uri) {
    const history = readHistory();
    history[uri] = Date.now();
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Storage can be full or blocked. */ }
  }

  // ---- Menu -------------------------------------------------------------------------------
  const menu = document.createElement("div");
  menu.id = "smart-mix-menu";
  menu.className = "smart-mix-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Shuffle options");
  menu.hidden = true;
  menu.innerHTML = `
    <small class="smart-mix-kicker">SHUFFLE</small>
    <button type="button" role="menuitemradio" data-smart-mode="off"><i aria-hidden="true">&#8594;</i><span>Shuffle off</span></button>
    <button type="button" role="menuitemradio" data-smart-mode="shuffle"><i aria-hidden="true">&#8644;</i><span>Shuffle</span></button>
    <button type="button" role="menuitemradio" data-smart-mode="smart"><i aria-hidden="true">&#10022;</i><span>Smart Mix</span><em>Turntable</em></button>
    <p class="smart-mix-note">Adds one of your songs every ${PICK_EVERY} songs while Turntable is open: same artist, your top songs, Liked Songs and recent plays.</p>
    <button type="button" role="menuitem" class="smart-mix-reconnect" hidden><i aria-hidden="true">&#8635;</i><span>Allow top songs &amp; recent plays</span></button>
    <div class="smart-mix-separator" aria-hidden="true"></div>
    <a role="menuitem" class="smart-mix-spotify" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer"><i aria-hidden="true">&#8599;</i><span>Smart Shuffle in Spotify<small>Opens the Spotify app. Turn it on there.</small></span></a>`;
  document.body.append(menu);
  const spotifyLink = menu.querySelector(".smart-mix-spotify");
  const reconnectRow = menu.querySelector(".smart-mix-reconnect");

  function shuffleActive() { return shuffle.classList.contains("active"); }
  function currentMode() { return enabled ? "smart" : shuffleActive() ? "shuffle" : "off"; }

  function contextUrl(pb) {
    const uri = pb?.context?.uri || "";
    let match = /^spotify:(playlist|album|artist|show):([A-Za-z0-9]{22})$/.exec(uri);
    if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
    if (/^spotify:user:[^:]+:collection$/.test(uri)) return "https://open.spotify.com/collection/tracks";
    match = /^spotify:track:([A-Za-z0-9]{22})$/.exec(pb?.item?.uri || "");
    return match ? `https://open.spotify.com/track/${match[1]}` : "https://open.spotify.com/";
  }

  function paintMenu() {
    const mode = currentMode();
    menu.querySelectorAll("[data-smart-mode]").forEach(button => {
      const on = button.dataset.smartMode === mode;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
    });
    reconnectRow.hidden = !needsReconnect;
    spotifyLink.href = contextUrl(lastPlayback);
  }

  function placeMenu() {
    const r = shuffle.getBoundingClientRect(), gap = 10, edge = 12;
    const width = menu.offsetWidth, height = menu.offsetHeight;
    let left = r.left + r.width / 2 - 36;
    left = Math.max(edge, Math.min(innerWidth - width - edge, left));
    let top = r.top - height - gap;
    if (top < edge) top = Math.min(innerHeight - height - edge, r.bottom + gap);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(Math.max(edge, top))}px`;
  }

  function openMenu(fromKeyboard = false) {
    paintMenu();
    menu.hidden = false;
    placeMenu();
    shuffle.setAttribute("aria-expanded", "true");
    if (fromKeyboard) (menu.querySelector("[data-smart-mode].active") || menu.querySelector("[data-smart-mode]")).focus({ preventScroll: true });
  }
  function closeMenu(returnFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    shuffle.setAttribute("aria-expanded", "false");
    if (returnFocus) shuffle.focus({ preventScroll: true });
  }

  function setShuffle(value) {
    if (shuffleActive() === value) return;
    if (typeof setOptimisticSetting === "function") setOptimisticSetting("shuffle", value);
    shuffle.classList.toggle("active", value);
    if (typeof setting === "function") void setting({ shuffle: value });
  }

  function setEnabled(value, note) {
    enabled = !!value;
    try { localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Storage can be blocked. */ }
    pendingPick = null; pendingAge = 0; retryAt = 0;
    songsSincePick = enabled ? PICK_EVERY : 0; // The first pick is queued right away.
    paintButton();
    if (note && typeof setMessage === "function") setMessage(note);
  }

  function choose(mode) {
    if (typeof physicalFeedback === "function") physicalFeedback("press");
    closeMenu(true);
    if (mode === "off") { if (enabled) setEnabled(false); setShuffle(false); return; }
    if (mode === "shuffle") { if (enabled) setEnabled(false, "Smart Mix off."); setShuffle(true); return; }
    setShuffle(true);
    if (!enabled) setEnabled(true, `Smart Mix on. A new pick plays every ${PICK_EVERY} songs.`);
    if (lastPlayback) void maybeQueue(lastPlayback);
  }

  menu.querySelectorAll("[data-smart-mode]").forEach(button => { button.onclick = () => choose(button.dataset.smartMode); });
  spotifyLink.addEventListener("click", () => { closeMenu(); });
  reconnectRow.onclick = async () => {
    reconnectRow.disabled = true;
    try { await api("/api/reauthorize", { method: "POST" }); }
    catch (error) { closeMenu(true); showError(error); }
    finally { reconnectRow.disabled = false; }
  };
  menu.addEventListener("keydown", event => {
    const items = [...menu.querySelectorAll("button:not([hidden]), a")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
    if (event.key === "Tab") closeMenu();
  });
  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !menu.contains(event.target) && !shuffle.contains(event.target)) closeMenu();
  }, true);
  window.addEventListener("resize", () => closeMenu());
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !menu.hidden && !menu.contains(event.target)) closeMenu(true); });

  // ---- Hold Shuffle -----------------------------------------------------------------------
  let holdTimer = null, holdStart = null, suppressClickUntil = 0;
  const cancelHold = () => { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; holdStart = null; };
  shuffle.setAttribute("aria-haspopup", "menu");
  shuffle.setAttribute("aria-expanded", "false");
  shuffle.addEventListener("pointerdown", event => {
    if (event.button > 0 || shuffle.disabled) return;
    holdStart = { x: event.clientX, y: event.clientY };
    holdTimer = setTimeout(() => {
      holdTimer = null;
      suppressClickUntil = performance.now() + 900;
      if (typeof physicalFeedback === "function") physicalFeedback("press");
      openMenu();
    }, HOLD_MS);
  });
  shuffle.addEventListener("pointermove", event => {
    if (holdStart && Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 12) cancelHold();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => shuffle.addEventListener(type, cancelHold));
  shuffle.addEventListener("contextmenu", event => event.preventDefault());
  shuffle.addEventListener("keydown", event => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10") || event.key === "ArrowUp") { event.preventDefault(); openMenu(true); }
  });
  // Runs before the app's own Shuffle tap: a hold must not also toggle shuffle, and a tap that
  // turns shuffle off also ends Smart Mix.
  window.addEventListener("click", event => {
    if (!shuffle.contains(event.target)) return;
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (enabled && shuffleActive()) setEnabled(false, "Smart Mix off.");
  }, true);

  function paintButton() {
    shuffle.classList.toggle("smart", enabled);
    const label = enabled ? "Shuffle: Smart Mix on. Hold for shuffle options" : "Shuffle. Hold for Smart Mix";
    shuffle.setAttribute("aria-label", label);
    shuffle.title = label;
    if (!menu.hidden) paintMenu();
  }

  // ---- Picks ------------------------------------------------------------------------------
  async function pool(name, key = name, artist = "") {
    const cached = pools.get(key);
    if (cached && Date.now() - cached.at < POOL_MS) return cached.items;
    const query = new URLSearchParams({ name });
    if (artist) query.set("artist", artist);
    const result = await api(`/api/smart-mix/source?${query}`);
    if (result.needs_reconnect) needsReconnect = true;
    const items = Array.isArray(result.items) ? result.items : [];
    pools.set(key, { at: Date.now(), items });
    return items;
  }

  async function choosePick(pb) {
    const current = pb.item;
    const avoid = new Set([current?.uri, ...(state?.queue || []).map(track => track?.uri)]);
    for (const uri of Object.keys(readHistory())) avoid.add(uri);
    const recent = pools.get("recent")?.items || [];
    for (const track of recent) if (track.played_at > Date.now() - RECENT_SKIP_MS) avoid.add(track.uri);
    for (let step = 0; step < SOURCES.length; step++) {
      const name = SOURCES[(sourceTurn + step) % SOURCES.length];
      let items = [];
      try {
        if (name === "artist") {
          const artist = current?.artists?.find(entry => /^[A-Za-z0-9]{22}$/.test(entry?.id || ""))?.id;
          if (!artist) continue;
          items = await pool("artist", `artist:${artist}`, artist);
        } else items = await pool(name);
      } catch (error) {
        if (error.status === 429) throw error;
        continue; // One unavailable source must not stop the others.
      }
      if (name === "recent") items = items.filter(track => !(track.played_at > Date.now() - RECENT_SKIP_MS));
      const options = items.filter(track => track?.uri && !avoid.has(track.uri));
      if (!options.length) continue;
      sourceTurn = (sourceTurn + step + 1) % SOURCES.length;
      return options[Math.floor(Math.random() * options.length)];
    }
    return null;
  }

  async function maybeQueue(pb) {
    if (!enabled || queueBusy || pendingPick || songsSincePick < PICK_EVERY) return;
    if (!pb?.is_playing || pb.item?.type !== "track" || pb.item?.is_local) return;
    if (Date.now() < retryAt) return; // After a failure, wait before trying again.
    queueBusy = true;
    retryAt = Date.now() + QUEUE_RETRY_MS;
    try {
      const pick = await choosePick(pb);
      if (!enabled) return;
      if (!pick) { setMessage("Smart Mix could not find a new song yet. It will try again soon."); return; }
      await api("/api/smart-mix/queue", { method: "POST", body: JSON.stringify({ uri: pick.uri, device_id: pb.device?.id || "" }) });
      remember(pick.uri);
      retryAt = 0;
      pendingPick = pick.uri;
      pendingAge = 0;
      if (typeof loadQueue === "function") void loadQueue(true);
    } catch (error) {
      if (typeof showError === "function") showError(error);
    } finally { queueBusy = false; }
  }

  function syncPlayback(pb, shuffleOn, stale = false) {
    lastPlayback = pb || null;
    if (!menu.hidden) paintMenu();
    const uri = pb?.item?.uri || null;
    const changed = !!(uri && uri !== lastUri);
    const previous = lastUri;
    if (uri) lastUri = uri; // Tracked even while off, so the first pick is recognised.
    if (!enabled) return;
    if (pb && !shuffleOn && !stale) { setEnabled(false, "Smart Mix turned off because shuffle is off."); return; }
    if (changed) {
      if (previous !== null) {
        if (uri === pendingPick) { pendingPick = null; songsSincePick = 0; }
        else {
          songsSincePick++;
          // A pick that never arrives (skipped in Spotify, queue cleared) stops blocking new ones.
          if (pendingPick && ++pendingAge > PICK_EVERY * 2) { pendingPick = null; pendingAge = 0; }
        }
      }
    }
    void maybeQueue(pb);
  }

  function markQueue() {
    const history = readHistory();
    document.querySelectorAll("#queue-list .queue-item").forEach(row => {
      const picked = !!history[row.dataset.uri];
      const badge = row.querySelector(".smart-pick-badge");
      if (picked && !badge) {
        const tag = document.createElement("span");
        tag.className = "smart-pick-badge";
        tag.textContent = "✦ SMART PICK";
        row.querySelector("b")?.after(tag);
      } else if (!picked && badge) badge.remove();
    });
  }

  window.turntableSmartMix = Object.freeze({ syncPlayback, markQueue, isEnabled: () => enabled, openMenu });
  paintButton();
  markQueue();
  if (typeof playback !== "undefined" && playback) syncPlayback(playback, shuffleActive());
})();
