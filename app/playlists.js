// Playlists tab: cards, pinning, drag-to-reorder and starting a playlist or Liked Songs.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
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
  card.dataset.playlistType = playlist.type || "playlist";
  card.draggable = playlistOrganizerMode;
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "playlist-play";
  playButton.setAttribute("aria-label", `Play ${playlist.name}`);
  const cover = document.createElement("span");
  cover.className = "playlist-cover";
  const fallback = document.createElement("span");
  fallback.className = "playlist-fallback";
  fallback.textContent = playlist.type === "liked-songs" ? "♥" : (playlist.name?.trim()?.[0]?.toUpperCase() || "Music");
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
  if (playlist.needs_reconnect) detail.textContent = "Tap to reconnect Spotify";
  else if (playlist.temporarily_unavailable) detail.textContent = "Saved tracks unavailable right now";
  else if (playlist.type === "liked-songs") detail.textContent = Number.isFinite(playlist.tracks) ? `${playlist.tracks} saved song${playlist.tracks === 1 ? "" : "s"}` : "Your saved songs";
  else detail.textContent = `${Number.isFinite(playlist.tracks) ? playlist.tracks : 0} songs`;
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
    const result = await api(spotify => spotify.playlists());
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
    if (playlist.needs_reconnect) {
      setMessage("Opening Spotify to enable Liked Songs...");
      await api(spotify => spotify.reauthorize(), { cooldown: false });
      return;
    }
    const deviceId = activeDeviceId();
    const result = await api(spotify => playlist.type === "liked-songs" ? spotify.playLikedSongs(deviceId) : spotify.playPlaylist(playlist.uri, deviceId));
    switchView("player");
    setTopBarHidden(true);
    if (result?.limited) setMessage(`Playing your ${result.played_count} most recent Liked Songs.`);
    else setMessage();
    setTimeout(() => refresh(true), 650);
    setTimeout(() => loadQueue(true), 900);
  } catch (error) { showError(error); }
  finally {
    commandPending = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
