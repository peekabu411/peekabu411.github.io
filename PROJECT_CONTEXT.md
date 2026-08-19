# Turntable iOS — Project Context

## Purpose

Turntable is a standalone, installable GitHub Pages web app for iPhone/iPad. It controls Spotify through each user's own Spotify Developer Web API application and Client ID. It is intentionally separate from the original LAN remote and Android projects.

## Live app and repository

- Live app: https://peekabu411.github.io/
- Repository: https://github.com/peekabu411/peekabu411.github.io
- Local project folder: `C:\Users\Luigi Mendoza\OneDrive\Documents\New project\peekabu411.github.io`
- Default branch: `main`
- Current release/version: `ver(I.9.7.16)` / tag `vI.9.7.16`

## Current deployed state

- Latest deployed commit: `5853804` — `Fix setup dashboard icon layout`.
- GitHub Pages deployment completed successfully for that commit on 2026-08-18.
- The setup screen's Step 3 and Step 4 dashboard shortcuts are 36px square green arrow buttons in the top-right of their cards.
- The Step 3 dashboard warning is forced red: “Can’t find Create app? Zoom out until the dashboard header is visible — the button appears at the top.”

## Product behavior

- Users install the app from Safari with **Share → Add to Home Screen**.
- Spotify connection uses PKCE in the browser. Users create or select their own Spotify Developer app, add the redirect URI `https://peekabu411.github.io/`, copy their Client ID, and connect.
- No Spotify Client Secret should ever be entered in Turntable.
- The app is static GitHub Pages hosting. It does not depend on a PC or LAN server.
- Spotify account and token data are stored only in the user's browser/device storage.

## Main implemented features

- Landscape-focused turntable controller with playback, volume, queue, album art, and now-playing controls.
- Display presets and settings, including the Android-inspired presets.
- Lyrics mode with LRCLIB lookup and automatic fallback to title display when lyrics are unavailable.
- Lyrics mode displays a subtle song-and-artist marquee near the Spotify button.
- Playlist organization with touch drag-and-drop, gap insertion indicator, and edge-only auto-scroll.
- Setup flow ordered as: sign in, copy redirect URI, create/choose app, copy Client ID, paste Client ID, connect Spotify.
- Internal update log and diagnostics are present in Settings.
- Interaction hints include “PRESS FOR TABS” and “SWIPE ↕ TO ADJUST.”

## Important files

- `index.html` — page structure, setup flow, current version text, update log.
- `app.js` — controller behavior, Spotify integration, displays, playlists, lyrics, settings.
- `bridge.js` — API/lyrics bridge behavior and request normalization.
- `styles.css` — primary app styles.
- `desktop-layout.css` — final stylesheet loaded by `index.html`; use this for critical iOS layout overrides.
- `screen-fit.css`, `settings-help.css`, `settings-help-previews.css`, `preset-controls.css` — supplemental styling.
- `manifest.json` and `icons/` — installed web-app identity.

## Styling and cache notes

- Stylesheets load in this order: `styles.css`, `settings-help.css`, `settings-help-previews.css`, `screen-fit.css`, `preset-controls.css`, `desktop-layout.css`.
- A style in an earlier stylesheet can be overridden later. For critical final layout overrides, add scoped rules to `desktop-layout.css`.
- When changing a CSS file, update its `?v=` query value in `index.html` so Safari/Home Screen does not keep an older stylesheet.
- The last setup fix intentionally removes `.setup-action` from the Step 3/4 arrow links because that shared class makes regular setup actions full-width.

## Release and deployment workflow

1. Make scoped changes in this repository.
2. Check changes with `git diff --check` and `git status --short`.
3. Commit and push to `main`.
4. Do not bump the version unless the user explicitly requests it. Version format uses capital letter I, for example `I.9.5`, never `1.9.5`.
5. For an I.9.5 maintenance update, move tag `vI.9.5` to the new commit and update the existing GitHub release. For a requested new version, create the requested tag/release and update the internal log.
6. Check GitHub Pages status with:

   ```powershell
   & 'C:\Program Files\GitHub CLI\gh.exe' api repos/peekabu411/peekabu411.github.io/pages/builds/latest --jq '{status:.status,commit:.commit,updated_at:.updated_at}'
   ```

7. `status: built` means the site is deployed. Home Screen Safari may still require closing/reopening the app or a refresh because of caching.

## GitHub CLI

- GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`
- Authenticated GitHub account: `peekabu411`.
- The repository is already connected to `origin` and GitHub Pages.

## Current cautions / follow-up checks

- Do not call the product Spotify; “Spotify” is only used where it describes the integration.
- Do not remove the `ver(I.9.3)` entry from the internal update log; it was previously restored after being removed accidentally.
- iOS cannot reliably hide the Home Indicator for a normal installed web app; avoid promising native fullscreen behavior.
- Lyrics availability depends on the lyric provider and track metadata. When unavailable, title display is the intended fallback.
- After visual changes, verify both the normal Safari site and the installed Home Screen app because Safari caching can make them appear different temporarily.
