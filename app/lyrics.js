// Synced lyrics: fetching from LRCLIB, parsing, layout and the active-line animation.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
function parseSyncedLyrics(text = "") {
  const parsed = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const stamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    const words = rawLine.replace(/\[[^\]]+\]/g, "").trim();
    if (!words) return;
    stamps.forEach((stamp) => parsed.push({ time: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000, text: words }));
  });
  return parsed.sort((a, b) => a.time - b.time);
}

function syncDisplayPresentation() {
  const lyricsConfirmed = lyricsAvailability === "available";
  const fallbackToInfo = displayStyle === "lyrics" && !lyricsConfirmed;
  const lyricsPanel = $("lyrics-panel");
  remote.dataset.display = fallbackToInfo ? "info" : displayStyle;
  remote.dataset.lyricsFallback = String(fallbackToInfo);
  if (lyricsPanel) lyricsPanel.hidden = fallbackToInfo;
  if (fallbackToInfo) {
    $("context").hidden = false;
    $("title").hidden = false;
    $("artist").hidden = false;
  }
  if (displayStyle === "lyrics" && lyricsAvailability === "unavailable") $("context").textContent = "LYRICS NOT AVAILABLE";
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
      else line.className = "lyric-pending";
      container.append(line);
    });
    container.scrollTop = 0;
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
  const sourceRecordId = LRCLIB_TRACK_RECORD_OVERRIDES.get(track?.uri) || null;
  return { query, cacheKey: (track?.uri || "no-uri") + "|" + query.toString(), sourceRecordId };
}
function cacheLyricsResult(cacheKey, result) {
  lyricsResultCache.set(cacheKey, result);
  if (lyricsResultCache.size > 30) lyricsResultCache.delete(lyricsResultCache.keys().next().value);
  return result;
}
async function requestLyricsResult(query, sourceRecordId = null) {
  const request = () => api(spotify => spotify.lyrics({ query, recordId: sourceRecordId }), { cooldown: false });
  try { return await request(); }
  catch { return await request(); } // One quick retry: the lyrics provider occasionally drops a request.
}
function prefetchLyrics(track) {
  if (!track?.uri) return Promise.resolve(null);
  const { query, cacheKey, sourceRecordId } = lyricsRequestFor(track);
  if (lyricsResultCache.has(cacheKey)) return Promise.resolve(lyricsResultCache.get(cacheKey));
  if (lyricsPrefetches.has(cacheKey)) return lyricsPrefetches.get(cacheKey);
  const request = requestLyricsResult(query, sourceRecordId)
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
  if (track) setLyricsAvailability("loading");
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
  const container = $("lyrics-lines");
  if (lyricStyle !== "scroll") {
    const stage = container.querySelector(".lyric-stage");
    if (!stage) return;
    if (lineIndex < 0 || !words.length) {
      if (activeLyricIndex >= 0) stage.replaceChildren();
      activeLyricIndex = -1;
      activeLyricWordIndex = -1;
      return;
    }
    if (lineIndex === activeLyricIndex && wordIndex === activeLyricWordIndex) return;
    activeLyricIndex = lineIndex;
    activeLyricWordIndex = wordIndex;
    if (lyricStyle === "word") {
      stage.textContent = words[wordIndex] || "";
      stage.animate?.([{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
    } else buildTimedLyricLine(stage, words, wordIndex);
    return;
  }
  const elements = [...container.children];
  const lyricTimelinePosition = position - lyricOffset * 1000;
  const introFadeProgress = Math.max(0, Math.min(1, (lyricTimelinePosition - (lyricsLines[0].time - 5_000)) / 5_000));
  const waitingForIntroFade = lineIndex < 0 && introFadeProgress <= 0;
  const fadingIntoFirstLine = lineIndex < 0 && introFadeProgress > 0;
  const introFadeWasActive = container.classList.contains("lyric-intro-fading");
  if (fadingIntoFirstLine && !introFadeWasActive) {
    const firstLine = elements[0];
    if (firstLine) {
      const firstLineCenter = firstLine.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop + firstLine.offsetHeight / 2;
      container.scrollTo({ top: Math.max(0, firstLineCenter - container.clientHeight * .46), behavior: "auto" });
    }
  }
  container.classList.toggle("lyric-intro-fading", fadingIntoFirstLine);
  container.style.setProperty("--lyric-intro-opacity", introFadeProgress.toFixed(3));
  elements.forEach((element) => element.classList.toggle("lyric-pending", waitingForIntroFade));
  if (lineIndex < 0) {
    if (activeLyricIndex >= 0) elements[activeLyricIndex]?.classList.remove("active");
    activeLyricIndex = -1;
    activeLyricWordIndex = -1;
    return;
  }
  if (lineIndex === activeLyricIndex) return;
  if (activeLyricIndex >= 0) elements[activeLyricIndex]?.classList.remove("active");
  activeLyricIndex = lineIndex;
  activeLyricWordIndex = -1;
  const active = elements[lineIndex];
  if (!active) return;
  active.classList.add("active");
  const activeCenter = active.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop + active.offsetHeight / 2;
  container.scrollTo({ top: Math.max(0, activeCenter - container.clientHeight * .46), behavior: "smooth" });
}
