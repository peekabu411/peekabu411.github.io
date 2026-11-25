// Album artwork: preloading, the vinyl record spin and change animations, progress clock, background fade.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
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
