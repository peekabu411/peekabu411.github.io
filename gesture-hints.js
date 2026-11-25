// Gesture hints retire one at a time: once a gesture has been used three times, its hint
// ("swipe to skip", "swipe to adjust", "press for tabs") stops showing on Now Playing.
// Choosing "Show text" for Gesture hints in Settings brings every hint back.
(() => {
  const KEY = "turntable-gesture-hints-used";
  const RETIRE_AFTER = 3;
  const KINDS = ["skip", "adjust", "tabs"];
  const remote = document.getElementById("remote");
  if (!remote) return;
  let counts = {};
  try { counts = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { counts = {}; }

  function apply() {
    KINDS.forEach(kind => remote.classList.toggle(`hint-retired-${kind}`, (counts[kind] || 0) >= RETIRE_AFTER));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch { /* private mode: hints simply stay */ }
  }

  window.turntableHints = Object.freeze({
    used(kind) {
      if (!KINDS.includes(kind) || (counts[kind] || 0) >= RETIRE_AFTER) return;
      counts[kind] = (counts[kind] || 0) + 1;
      save();
      apply();
    },
    reset() { counts = {}; save(); apply(); }
  });

  document.querySelector('[data-guide-choice="shown"]')?.addEventListener("click", () => window.turntableHints.reset());
  apply();
})();
