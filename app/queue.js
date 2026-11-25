// Queue drawer and "Play next".
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
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
      await api(spotify => spotify.skip(remainingSkips, activeDeviceId()));
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
    const result = await api(spotify => spotify.queue());
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
