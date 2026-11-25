// The single description of every appearance/playback setting: its saved key, allowed values,
// default and limits. app.js reads the current settings through it and presets
// (preset-controls.js) save and check them through it, so a new setting is added here once.
(() => {
  const choice = (key, values, fallback) => ({ key, read: value => values.includes(value) ? value : fallback });
  const number = (key, min, max, fallback, step) => ({
    key,
    read: value => {
      const n = Number(value);
      if (value === null || value === "" || !Number.isFinite(n) || n === 0) return fallback;
      return Math.max(min, Math.min(max, step ? Math.round(n / step) * step : n));
    }
  });
  const SETTINGS = {
    album: choice("turntable-album-style", ["square", "vinyl"], "square"),
    control: choice("turntable-control-style", ["dial", "bar"], "dial"),
    display: choice("turntable-display-style", ["info", "lyrics"], "info"),
    lyricsBackground: choice("turntable-lyrics-background", ["transparent", "solid"], "transparent"),
    playerBackground: choice("turntable-player-background", ["artwork", "solid"], "artwork"),
    backgroundColorMode: choice("turntable-background-color-mode", ["auto", "manual"], "auto"),
    manualBackgroundColor: { key: "turntable-manual-background-color", read: value => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#34261f" },
    lyricStyle: choice("turntable-lyric-style", ["scroll", "word", "karaoke", "reveal", "focus"], "scroll"),
    playbackBar: choice("turntable-playback-bar-style", ["default", "divider"], "default"),
    guides: choice("turntable-guide-text", ["shown", "hidden"], "shown"),
    controlBarBackground: choice("turntable-control-bar-background", ["opaque", "translucent", "transparent"], "transparent"),
    volumeWeight: choice("turntable-volume-weight", ["light", "medium", "heavy"], "heavy"),
    layoutProfile: choice("turntable-layout-profile", ["auto", "compact", "standard", "wide"], "auto"),
    uiFontScale: number("turntable-ui-font-scale", 90, 110, 100),
    lyricFontScale: number("turntable-lyric-font-scale", 90, 130, 110),
    lyricOffset: { key: "turntable-lyric-offset", read: value => {
      const n = Number(value);
      return value === null || !Number.isFinite(n) ? -0.7 : Math.max(-1.2, Math.min(-0.2, n));
    } },
    controlBar: choice("turntable-control-bar", ["shown", "hidden"], "shown")
  };
  const DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).map(([name, setting]) => [name, setting.read(null)]));

  // Current settings as saved on this device, one key per setting.
  function read(storage = localStorage) {
    const saved = Object.fromEntries(Object.entries(SETTINGS).map(([name, setting]) => [name, setting.read(storage.getItem(setting.key))]));
    // Before album and volume styles were separate, one "theme" chose both.
    const legacyTurntableTheme = (storage.getItem("turntable-theme") || "design-1") === "turntable";
    if (!storage.getItem(SETTINGS.album.key) && legacyTurntableTheme) saved.album = "vinyl";
    if (!storage.getItem(SETTINGS.control.key) && legacyTurntableTheme) saved.control = "bar";
    // A saved lyric offset of exactly 0 was the old default; move it once to the newer -0.7.
    if (storage.getItem("turntable-lyric-offset-default-v2") !== "applied" && Number(storage.getItem(SETTINGS.lyricOffset.key)) === 0) saved.lyricOffset = -0.7;
    storage.setItem("turntable-lyric-offset-default-v2", "applied");
    return saved;
  }

  // Checks a preset's settings, filling anything missing or invalid with the default.
  function normalize(value = {}) {
    const merged = { ...DEFAULTS, ...value };
    const out = Object.fromEntries(Object.entries(SETTINGS).map(([name, setting]) => [name, setting.read(merged[name])]));
    out.manualBackgroundColor = out.manualBackgroundColor.toLowerCase();
    out.uiFontScale = Math.max(90, Math.min(110, Math.round(Number(merged.uiFontScale) / 5) * 5));
    out.lyricFontScale = Math.max(90, Math.min(130, Math.round(Number(merged.lyricFontScale) / 5) * 5));
    out.lyricOffset = Math.max(-1.2, Math.min(-0.2, Math.round(Number(merged.lyricOffset) * 10) / 10));
    return out;
  }

  window.turntableSettings = Object.freeze({ DEFAULTS: Object.freeze(DEFAULTS), read, normalize, keyOf: name => SETTINGS[name].key });
})();
