(() => {
  const help = {
    album: {
      title: "Album style",
      summary: "Changes how the current album artwork is presented without changing playback.",
      details: ["Square uses a sliding album card.", "Vinyl places the artwork on a rotating record and uses a spin transition when tracks change."],
      visuals: [["Square", "square"], ["Vinyl", "vinyl"]]
    },
    control: {
      title: "Volume control",
      summary: "Changes the physical-style volume control on the right side of Now Playing.",
      details: ["Dial uses repeated weighted strokes like turning a physical knob.", "Bar uses a vertical track with a pressable button at the top."],
      visuals: [["Dial", "dial"], ["Bar", "control-bar"]]
    },
    display: {
      title: "Now Playing display",
      summary: "Chooses what occupies the main information area beside the artwork.",
      details: ["Song info shows the title and artist.", "Lyrics shows synchronized lyrics when available and automatically falls back to song info when lyrics are unavailable."],
      visuals: [["Song info", "song-info"], ["Lyrics", "lyrics"]]
    },
    background: {
      title: "Player background",
      summary: "Controls the background behind Now Playing.",
      details: ["Artwork crossfades enlarged album artwork behind the player; Square now uses the same neutral dark shade as Vinyl.", "Solid fills the player with color.", "Auto samples color locally from the album cover. Manual reveals a compact picker and applies that color to Artwork tint, Solid backgrounds, and solid lyric surfaces."],
      visuals: [["Artwork", "artwork-bg"], ["Solid", "solid-bg"]]
    },
    playbackBar: {
      title: "Playback bar",
      summary: "Changes where the draggable song-progress line is placed.",
      details: ["Default places the line below the title or lyrics.", "Divider turns the upper edge of the bottom control bar into the progress line."],
      visuals: [["Default", "progress-default"], ["Divider", "progress-divider"]]
    },
    volumeWeight: {
      title: "Volume weight",
      summary: "Adjusts how much the volume moves for the same finger stroke.",
      details: ["Light responds quickly.", "Medium is balanced.", "Heavy requires longer or repeated strokes and feels more physical."],
      visuals: []
    },
    lyricStyle: {
      title: "Lyric animation",
      summary: "Changes how synchronized lyric timing is visualized.",
      details: ["Scroll follows active lines.", "Word shows one word at a time.", "Karaoke highlights words in the full line.", "Reveal builds the current line.", "Focus centers the active word."],
      visuals: []
    },
    lyricBackground: {
      title: "Lyric background",
      summary: "Changes only the surface behind the lyric window.",
      details: ["Solid uses a readable album-derived color.", "Clear lets the main player background show through."],
      visuals: [["Solid", "lyric-solid"], ["Clear", "lyric-clear"]]
    },
    hints: {
      title: "On-screen hints",
      summary: "Shows or hides instructional labels without disabling gestures.",
      details: ["Show text displays prompts such as swipe and press.", "Hide text keeps the player cleaner; every gesture and button continues to work."],
      visuals: []
    },
    screenFit: {
      title: "Screen fit",
      summary: "Selects a density profile for lists, Settings, pairing, and spacing. It does not change your album, controls, or playback layout choices.",
      details: ["Auto detects the available short and long edges and is recommended.", "Compact reduces secondary text and spacing on short landscape screens such as an iPhone 13 Pro.", "Standard uses regular phone density.", "Wide expands grids and spacing for tablets and desktop browsers."],
      visuals: []
    }
  };

  const settingSelectors = [
    ["[data-album-choice]", "album"],
    ["[data-control-choice]", "control"],
    ["[data-display-choice]", "display"],
    ["[data-player-background-choice]", "background"],
    ["[data-playback-bar-choice]", "playbackBar"],
    ["[data-volume-weight-choice]", "volumeWeight"],
    ["[data-lyric-style-choice]", "lyricStyle"],
    ["[data-lyrics-background-choice]", "lyricBackground"],
    ["[data-guide-choice]", "hints"],
    ["[data-layout-profile-choice]", "screenFit"]
  ];

  const modal = document.getElementById("settings-help-modal");
  const card = document.getElementById("settings-help-card");
  const title = document.getElementById("settings-help-title");
  const summary = document.getElementById("settings-help-summary");
  const details = document.getElementById("settings-help-details");
  const preview = document.getElementById("settings-help-preview");
  const current = document.getElementById("settings-help-current");
  let returnFocus = null;

  function currentNote(key) {
    if (key === "screenFit") {
      const selected = remote.dataset.layoutProfile || "auto";
      const resolved = remote.dataset.layoutResolved || "standard";
      return selected === "auto" ? `Current: Auto → ${resolved}` : `Current: ${resolved}`;
    }
    return "Changes apply immediately and remain saved on this phone.";
  }

  function renderPreview(definition) {
    if (!definition.visuals.length) {
      preview.innerHTML = "";
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    preview.innerHTML = definition.visuals.map(([label, visual]) => `
      <figure class="settings-help-preview-item">
        <div class="settings-help-device visual-${visual}" role="img" aria-label="${label} setting illustration">
          <img class="preview-background" src="/help-artwork.svg" alt="">
          <img class="preview-art" src="/help-artwork.svg" alt="">
          <span class="preview-copy"><b>Sunday Morning</b><small>Turntable Radio</small></span>
          <span class="preview-lyrics"><small>Feel the rhythm</small><b>all around us</b><small>moving slowly</small></span>
          <span class="preview-progress"><i></i></span>
          <span class="preview-controls"><i>&#8644;</i><i>&#9664;&#9664;</i><i class="preview-play">&#9654;</i><i>&#9654;&#9654;</i><i>&#8635;</i></span>
          <span class="preview-dial"></span><span class="preview-volume-bar"><i></i></span>
        </div>
        <figcaption>${label}</figcaption>
      </figure>`).join("");
    const liveArtwork = document.getElementById("cover")?.getAttribute("src")?.trim() || "/help-artwork.svg";
    preview.querySelectorAll(".preview-art,.preview-background").forEach((image) => {
      image.src = liveArtwork;
      image.onerror = () => { image.onerror = null; image.src = "/help-artwork.svg"; };
    });
  }

  function openHelp(key, trigger) {
    const definition = help[key];
    if (!definition || !modal) return;
    returnFocus = trigger;
    title.textContent = definition.title;
    summary.textContent = definition.summary;
    details.innerHTML = definition.details.map((item) => `<li>${item}</li>`).join("");
    current.textContent = currentNote(key);
    renderPreview(definition);
    modal.hidden = false;
    card.focus({ preventScroll: true });
  }

  function closeHelp() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    returnFocus?.focus({ preventScroll: true });
  }

  settingSelectors.forEach(([selector, key]) => {
    const control = document.querySelector(selector);
    const setting = control?.closest(".appearance-setting");
    if (!setting || setting.dataset.helpReady) return;
    const label = setting.querySelector(":scope > span");
    if (!label) return;
    setting.dataset.helpReady = "true";
    const row = document.createElement("div");
    row.className = "setting-title-row";
    label.before(row);
    row.append(label);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "setting-info-button";
    button.textContent = "i";
    button.setAttribute("aria-label", `Explain ${label.textContent.trim().toLowerCase()}`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof physicalFeedback === "function") physicalFeedback("press");
      openHelp(key, button);
    });
    row.append(button);
  });

  document.getElementById("settings-help-close")?.addEventListener("click", closeHelp);
  document.getElementById("settings-help-backdrop")?.addEventListener("click", closeHelp);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) closeHelp();
  });
})();
