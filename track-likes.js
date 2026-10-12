(() => {
  const button = document.getElementById("track-like");
  const permission = document.getElementById("library-permission");
  const pending = new Set();
  let currentUri = null, saved = null, needsReconnect = false, sequence = 0;
  function trackUri(track) {
    if (!track || track.is_local || (track.type && track.type !== "track")) return null;
    const uri = track.linked_from?.uri || track.uri;
    return /^spotify:track:[A-Za-z0-9]{22}$/.test(uri || "") ? uri : null;
  }
  function paint(busy = false) {
    button.disabled = !currentUri || busy || pending.has(currentUri);
    button.setAttribute("aria-busy", String(busy || pending.has(currentUri)));
    button.setAttribute("aria-pressed", String(saved === true));
    const label = !currentUri ? "Play a Spotify song to use Liked Songs" : saved === null ? "Check song's Liked Songs status" : saved ? "Remove song from Liked Songs" : "Add song to Liked Songs";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  async function check(uri, token) {
    paint(true);
    try {
      const result = await api(`/api/library/track?uri=${encodeURIComponent(uri)}`);
      if (currentUri !== uri || token !== sequence) return;
      saved = result.saved;
      needsReconnect = !!result.needs_reconnect;
    } catch (error) {
      if (currentUri !== uri || token !== sequence) return;
      needsReconnect = !!error.needsReconnect;
      // A failed read is unknown, never an invented unliked state.
      saved = null;
      if (!needsReconnect) showError(error);
    } finally { if (currentUri === uri && token === sequence) paint(); }
  }
  function syncTrack(track) {
    const uri = trackUri(track);
    if (currentUri === uri) return; // Status polls do not make more library calls.
    currentUri = uri;
    const token = ++sequence;
    saved = null;
    needsReconnect = false;
    paint();
    if (uri && session) check(uri, token);
  }
  function closePermission() {
    permission.hidden = true;
    button.focus({ preventScroll: true });
  }
  function askPermission() {
    permission.hidden = false;
    document.getElementById("library-permission-connect").focus({ preventScroll: true });
  }
  button.onclick = async event => {
    event.stopPropagation();
    physicalFeedback("press");
    const uri = currentUri, token = sequence;
    if (!uri || pending.has(uri) || button.disabled) return;
    if (needsReconnect) { askPermission(); return; }
    if (saved === null) { await check(uri, token); return; }
    const nextSaved = !saved;
    pending.add(uri);
    paint();
    try {
      const result = await api("/api/library/track", { method: "PUT", body: JSON.stringify({ uri, saved: nextSaved }) });
      playlistsLoaded = false; // Refresh the synthetic card next time Playlists opens.
      if (currentUri === uri) { ++sequence; saved = result.saved; }
      setMessage(result.saved ? "Added to Liked Songs." : "Removed from Liked Songs.");
    } catch (error) {
      if (currentUri === uri && token === sequence && error.needsReconnect) {
        needsReconnect = true;
        askPermission();
      } else showError(error);
    } finally {
      pending.delete(uri);
      // An old track's request must not replace the current track's heart state.
      if (currentUri === uri) paint();
    }
  };
  document.getElementById("library-permission-dismiss").onclick = closePermission;
  permission.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closePermission(); }
    if (event.key === "Tab") {
      event.preventDefault();
      const connect = document.getElementById("library-permission-connect"), dismiss = document.getElementById("library-permission-dismiss");
      (document.activeElement === connect ? dismiss : connect).focus();
    }
  });
  document.getElementById("library-permission-connect").onclick = async event => {
    const connect = event.currentTarget;
    connect.disabled = true;
    try { await api("/api/reauthorize", { method: "POST" }); }
    catch (error) { closePermission(); showError(error); }
    finally { connect.disabled = false; }
  };
  window.turntableLikes = Object.freeze({ syncTrack });
  paint();
  syncTrack(playback?.item);
})();
