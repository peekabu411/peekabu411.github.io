(() => {
  const STORAGE_KEY = "turntable-setting-presets-v1";
  const ACTIVE_KEY = "turntable-active-setting-preset";
  const DEFAULT_SETTINGS = {
    album: "square", control: "dial", display: "info", lyricsBackground: "transparent",
    playerBackground: "artwork", backgroundColorMode: "auto", manualBackgroundColor: "#34261f",
    lyricStyle: "scroll", playbackBar: "default", guides: "shown",
    controlBarBackground: "transparent", volumeWeight: "heavy",
    layoutProfile: "auto", uiFontScale: 100, lyricFontScale: 110, lyricOffset: -0.7
  };
  const BUILT_IN_PRESETS = [
    { id: "default", name: "Vinyl \u00b7 Default", settings: { ...DEFAULT_SETTINGS, album: "vinyl", control: "dial", display: "info", playbackBar: "default" } },
    { id: "set-1", name: "Square \u00b7 Divider", settings: { ...DEFAULT_SETTINGS, album: "square", control: "bar", display: "info", playbackBar: "divider", controlBarBackground: "translucent" } },
    { id: "set-2", name: "Vinyl \u00b7 Lyrics", settings: { ...DEFAULT_SETTINGS, album: "vinyl", control: "dial", display: "lyrics", lyricsBackground: "solid", lyricStyle: "scroll", playbackBar: "divider" } }
  ];  const settingKeys = Object.keys(DEFAULT_SETTINGS);
  const topSelect = document.getElementById("top-preset-select");
  const settingsSelect = document.getElementById("settings-preset-select");
  const saveButton = document.getElementById("preset-save");
  const manageButton = document.getElementById("preset-manage");
  const modal = document.getElementById("preset-modal");
  const modalCard = document.getElementById("preset-modal-card");
  const modalTitle = document.getElementById("preset-modal-title");
  const modalMessage = document.getElementById("preset-modal-message");
  const nameInput = document.getElementById("preset-name");
  const saveSwitchButton = document.getElementById("preset-save-switch");
  const discardSwitchButton = document.getElementById("preset-discard-switch");
  const createButton = document.getElementById("preset-create");
  const renameButton = document.getElementById("preset-rename");
  const deleteButton = document.getElementById("preset-delete");
  let pendingPresetId = null;
  let dirty = false;

  function currentSettings() {
    return {
      album: albumStyle, control: controlStyle, display: displayStyle,
      lyricsBackground, playerBackground: playerBackgroundStyle, backgroundColorMode, manualBackgroundColor, lyricStyle,
      playbackBar: playbackBarStyle, guides: guideText, controlBarBackground,
      volumeWeight, layoutProfile, uiFontScale, lyricFontScale, lyricOffset
    };
  }

  function normalizeSettings(value = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...value };
    return {
      album: merged.album === "vinyl" ? "vinyl" : "square",
      control: merged.control === "bar" ? "bar" : "dial",
      display: merged.display === "lyrics" ? "lyrics" : "info",
      lyricsBackground: merged.lyricsBackground === "solid" ? "solid" : "transparent",
      playerBackground: merged.playerBackground === "solid" ? "solid" : "artwork",
      backgroundColorMode: merged.backgroundColorMode === "manual" ? "manual" : "auto",
      manualBackgroundColor: /^#[0-9a-f]{6}$/i.test(merged.manualBackgroundColor) ? merged.manualBackgroundColor.toLowerCase() : "#34261f",
      lyricStyle: ["scroll", "word", "karaoke", "reveal", "focus"].includes(merged.lyricStyle) ? merged.lyricStyle : "scroll",
      playbackBar: merged.playbackBar === "divider" ? "divider" : "default",
      guides: merged.guides === "hidden" ? "hidden" : "shown",
      controlBarBackground: ["opaque", "translucent", "transparent"].includes(merged.controlBarBackground) ? merged.controlBarBackground : "transparent",
      volumeWeight: ["light", "medium", "heavy"].includes(merged.volumeWeight) ? merged.volumeWeight : "heavy",
      layoutProfile: ["auto", "compact", "standard", "wide"].includes(merged.layoutProfile) ? merged.layoutProfile : "auto",
      uiFontScale: Math.max(90, Math.min(110, Math.round(Number(merged.uiFontScale) / 5) * 5)),
      lyricFontScale: Math.max(90, Math.min(130, Math.round(Number(merged.lyricFontScale) / 5) * 5)),
      lyricOffset: Math.max(-1.2, Math.min(-0.2, Math.round(Number(merged.lyricOffset) * 10) / 10))
    };
  }

  function initialLibrary() {
    return BUILT_IN_PRESETS.map((preset) => ({ ...preset, settings: normalizeSettings(preset.settings) }));
  }

  function loadLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(parsed) || !parsed.length) return initialLibrary();
      const valid = parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string").map((item) => ({
        id: item.id, name: item.name.trim().slice(0, 28) || "Preset", settings: normalizeSettings(item.settings)
      }));
      const builtInIds = new Set(BUILT_IN_PRESETS.map((preset) => preset.id));
      return [...initialLibrary(), ...valid.filter((item) => !builtInIds.has(item.id))];
    } catch { return initialLibrary(); }
  }
  let presets = loadLibrary();
  let activeId = localStorage.getItem(ACTIVE_KEY);
  if (!presets.some((item) => item.id === activeId)) activeId = presets.some((item) => item.id === "set-1") ? "set-1" : presets[0].id;

  function activePreset() { return presets.find((item) => item.id === activeId) || presets[0]; }
  function sameSettings(left, right) { return settingKeys.every((key) => left?.[key] === right?.[key]); }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    localStorage.setItem(ACTIVE_KEY, activeId);
  }

  function fillSelect(select) {
    if (!select) return;
    select.replaceChildren(...presets.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      return option;
    }));
    select.value = activeId;
  }

  function syncControls() {
    fillSelect(topSelect);
    fillSelect(settingsSelect);
    document.querySelectorAll(".preset-selector-shell").forEach((shell) => shell.classList.toggle("dirty", dirty));
    if (saveButton) {
      saveButton.disabled = !dirty;
      saveButton.textContent = dirty ? "Save*" : "Saved";
      saveButton.setAttribute("aria-label", dirty ? `Save changes to ${activePreset().name}` : `${activePreset().name} is saved`);
    }
  }

  function updateDirty() {
    dirty = !sameSettings(normalizeSettings(currentSettings()), activePreset().settings);
    syncControls();
  }

  function saveActive() {
    const preset = activePreset();
    preset.settings = normalizeSettings(currentSettings());
    dirty = false;
    persist();
    syncControls();
    if (typeof setMessage === "function") setMessage(`${preset.name} saved.`);
  }

  function applyPreset(id) {
    const preset = presets.find((item) => item.id === id);
    if (!preset) { syncControls(); return; }
    const settings = normalizeSettings(preset.settings);
    activeId = preset.id;
    applyAppearance(settings.album, settings.control, settings.display, settings.lyricsBackground, settings.playerBackground, settings.lyricStyle, settings.playbackBar, settings.guides, settings.controlBarBackground);
    applyBackgroundColorMode(settings.backgroundColorMode, settings.manualBackgroundColor);
    applyVolumeWeight(settings.volumeWeight);
    applyLayoutProfile(settings.layoutProfile);
    applyUIFontScale(settings.uiFontScale);
    applyLyricFontScale(settings.lyricFontScale);
    setLyricOffset(settings.lyricOffset);
    dirty = false;
    persist();
    syncControls();
    if (typeof setMessage === "function") setMessage(`${preset.name} applied.`);
  }

  function closeModal() {
    modal.hidden = true;
    pendingPresetId = null;
    syncControls();
  }

  function setModalMode(mode) {
    const switching = mode === "switch";
    nameInput.hidden = switching;
    saveSwitchButton.hidden = !switching;
    discardSwitchButton.hidden = !switching;
    createButton.hidden = switching;
    renameButton.hidden = switching;
    deleteButton.hidden = switching;
  }

  function openSwitchWarning(targetId) {
    pendingPresetId = targetId;
    const target = presets.find((item) => item.id === targetId);
    modalTitle.textContent = "Unsaved preset";
    modalMessage.textContent = `Save changes to ${activePreset().name} before switching to ${target?.name || "the selected preset"}?`;
    setModalMode("switch");
    modal.hidden = false;
    modalCard.focus({ preventScroll: true });
  }

  function openManager() {
    const preset = activePreset();
    modalTitle.textContent = "Manage presets";
    modalMessage.textContent = "Create a preset from the current Settings, or rename the selected preset.";
    nameInput.hidden = false;
    nameInput.value = preset.id === "default" ? "" : preset.name;
    nameInput.placeholder = preset.id === "default" ? "New preset name" : preset.name;
    setModalMode("manage");
    renameButton.disabled = preset.id === "default";
    deleteButton.disabled = preset.id === "default";
    modal.hidden = false;
    setTimeout(() => nameInput.focus({ preventScroll: true }), 0);
  }

  function requestSwitch(id) {
    if (id === activeId) { syncControls(); return; }
    if (dirty) openSwitchWarning(id);
    else applyPreset(id);
  }

  [topSelect, settingsSelect].forEach((select) => select?.addEventListener("change", () => requestSwitch(select.value)));
  saveButton?.addEventListener("click", () => { physicalFeedback("press"); saveActive(); });
  manageButton?.addEventListener("click", () => { physicalFeedback("press"); openManager(); });
  document.getElementById("preset-modal-close")?.addEventListener("click", () => { physicalFeedback("press"); closeModal(); });
  document.getElementById("preset-modal-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("preset-cancel")?.addEventListener("click", () => { physicalFeedback("press"); closeModal(); });
  saveSwitchButton?.addEventListener("click", () => { physicalFeedback("press"); const target = pendingPresetId; saveActive(); closeModal(); applyPreset(target); });
  discardSwitchButton?.addEventListener("click", () => { physicalFeedback("press"); const target = pendingPresetId; closeModal(); applyPreset(target); });
  createButton?.addEventListener("click", () => {
    physicalFeedback("press");
    const name = nameInput.value.trim().slice(0, 28) || `Preset ${presets.length}`;
    const id = globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`;
    presets.push({ id, name, settings: normalizeSettings(currentSettings()) });
    activeId = id; dirty = false; persist(); closeModal(); syncControls();
    setMessage(`${name} created.`);
  });
  renameButton?.addEventListener("click", () => {
    physicalFeedback("press");
    const preset = activePreset();
    if (preset.id === "default") return;
    const name = nameInput.value.trim().slice(0, 28);
    if (!name) { modalMessage.textContent = "Enter a name before renaming this preset."; return; }
    preset.name = name; persist(); closeModal(); syncControls(); setMessage(`Preset renamed to ${name}.`);
  });
  deleteButton?.addEventListener("click", () => {
    physicalFeedback("press");
    const preset = activePreset();
    if (preset.id === "default") return;
    presets = presets.filter((item) => item.id !== preset.id);
    activeId = "default"; persist(); closeModal(); applyPreset("default");
  });

  const settingsPanel = document.querySelector('[data-panel="settings"]');
  const trackedSelector = [
    "[data-album-choice]", "[data-control-choice]", "[data-display-choice]", "[data-player-background-choice]",
    "[data-background-color-mode]", "#background-color-picker", "[data-playback-bar-choice]", "[data-volume-weight-choice]", "[data-control-bar-background-choice]",
    "[data-lyric-style-choice]", "[data-lyrics-background-choice]", "[data-guide-choice]",
    "[data-layout-profile-choice]", "#lyric-offset", "#ui-font-size", "#lyric-font-size"
  ].join(",");
  let dirtyFrame = null;
  function scheduleDirtyUpdate() {
    if (dirtyFrame !== null) return;
    dirtyFrame = requestAnimationFrame(() => {
      dirtyFrame = null;
      updateDirty();
    });
  }
  settingsPanel?.addEventListener("click", (event) => {
    if (event.target.closest(trackedSelector)) setTimeout(updateDirty, 0);
  });
  settingsPanel?.addEventListener("input", (event) => {
    if (event.target.matches("#lyric-offset,#ui-font-size,#lyric-font-size,#background-color-picker")) scheduleDirtyUpdate();
  });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

  persist();
  syncControls();
})();
