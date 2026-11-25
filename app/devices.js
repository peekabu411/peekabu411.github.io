// Devices tab: Spotify Connect devices and switching playback.
// Part of the app split from the former app.js. These are classic scripts that share
// top-level names; bridge.js loads them in order (see APP_SCRIPTS), core.js first.
function renderDevices(devices = []) {
  const list = $("device-list"); list.replaceChildren();
  if (!devices.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Open Spotify on a phone, computer or speaker to make it appear here."; list.append(empty); return; }
  devices.forEach((device) => {
    const row = document.createElement("div"); row.className = `device-item${device.is_active ? " active" : ""}`;
    const icon = document.createElement("span"); icon.className = "device-icon"; icon.textContent = device.type === "Computer" ? "▣" : "◉";
    const copy = document.createElement("div");
    const name = document.createElement("b"); name.textContent = device.name;
    const detail = document.createElement("small"); detail.textContent = `${device.type} · ${device.volume_percent ?? 0}% volume`;
    const button = document.createElement("button"); button.textContent = device.is_active ? "Active" : "Connect"; button.disabled = device.is_active;
    button.onclick = async () => { await setting({ device_id: device.id }); await loadDevices(true); };
    copy.append(name, detail); row.append(icon, copy, button); list.append(row);
  });
}

function refreshDevicesView() {
  const devicesStale = !devicesLastRefreshAt || Date.now() - devicesLastRefreshAt >= DEVICES_VIEW_REFRESH_MS;
  return Promise.allSettled([loadDevices(devicesStale)]);
}
function scheduleDevicesViewRefresh(delay = DEVICES_VIEW_REFRESH_MS) {
  if (devicesViewRefreshTimer) clearTimeout(devicesViewRefreshTimer);
  devicesViewRefreshTimer = null;
  if (!session || document.hidden || currentView !== "devices") return;
  devicesViewRefreshTimer = setTimeout(async () => {
    devicesViewRefreshTimer = null;
    await refreshDevicesView();
    scheduleDevicesViewRefresh();
  }, Math.max(0, delay));
}

async function loadDevices(force = false) {
  if (devicesLoading || (devicesLoaded && !force)) return;
  devicesLoading = true;
  try {
    const result = await api(spotify => spotify.devices());
    const devices = result.items || [];
    state = { ...(state || {}), devices };
    renderDevices(devices);
    devicesLoaded = true;
    devicesLastRefreshAt = Date.now();
    setConnectionState("connected", "The Spotify device list responded.", {
      updatedAt: devicesLastRefreshAt,
      cacheAge: connectionState.cacheAge,
    });
  } catch (error) {
    const cooldown = Number(error?.status) === 429;
    setConnectionState(
      cooldown ? "cooldown" : "offline",
      cooldown ? "Spotify is cooling down; cached device information remains available." : "Device refresh failed; cached information remains available.",
    );
    showError(error);
  }
  finally { devicesLoading = false; }
}
