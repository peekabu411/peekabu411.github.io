# Turntable iOS — Project Context

## Purpose

Turntable is a standalone, installable GitHub Pages web app for iPhone/iPad. It controls Spotify through each user's own Spotify Developer Web API application and Client ID. It is intentionally separate from the original LAN remote and Android projects.

## Live app and repository

- Live app: https://peekabu411.github.io/
- Repository: https://github.com/peekabu411/peekabu411.github.io
- Local project folder: `C:\Users\Luigi Mendoza\OneDrive\Documents\New project\peekabu411.github.io`
- Default branch: `main`
- Current release/version: `ver(I.9.7.40)` / tag `vI.9.7.40`

## Current deployed state

- Latest deployed release is tracked by the active version/tag above and GitHub Pages build status.
- I.9.7.40 extends the corrected full-screen Wide layout to coarse-pointer landscape viewports from 1000 × 650 upward, covering iPad mini and larger tablets while preserving the original large-phone layout below that combined threshold.
- I.9.7.39 fixes the large-touch Wide-layout breakpoint (including iPad Pro at 1366 × 1024): the app fills the viewport, the top tabs truly collapse, the trigger moves below open tabs without overlapping its hint, and only half of the side volume dial remains visible.
- I.9.7.38 maps Spotify track `08PQgCL2WTNuMKAnbKC9jV` to LRCLIB record `11006398`, correcting its approximately nine-second longer intro while keeping other Oshakashama masters unchanged. Lyric cache keys now include the Spotify track URI so identical metadata cannot mix different recordings.
- I.9.7.37 is deployed: each Scroll lyric song resets to the beginning, and the first line is placed at the normal focus position before the intro fade begins.
- I.9.7.36 fades Scroll lyrics from 0% to 100% during the five seconds before the first timestamp, driven by playback time.
- I.9.7.35 restores the full Scroll lyric list after the intro so active, previous, and upcoming lines remain visible.
- I.9.7.34 opens Spotify's direct Create app route from Setup Step 3, bypassing the dashboard button hidden beneath Spotify's announcement banner.
- I.9.7.33 keeps synced lyric lines hidden until their timestamp begins, so instrumental intros stay in lyrics mode without premature text.
- I.9.7.32 fixed album-art glow and artwork backdrop updates during every song-change animation.
- I.9.7.31 uses normal 7.5-second status checks, while faster 2-second checks run only during the final 3 seconds of a playing track.
- I.9.7.30 adds a slower, layered card-slide animation for automatic square album-art changes at natural song boundaries; manual artwork swipes remain fast.
- I.9.7.29 cancels a pending scheduled status check while a playback or settings action confirms, then resumes one scheduled check afterward to avoid duplicate requests.
- The setup screen's Step 3 and Step 4 dashboard shortcuts are 36px square green arrow buttons in the top-right of their cards.
- Step 3 opens Spotify's direct Create app route (`https://developer.spotify.com/dashboard/create`) so first-time users do not need to locate a dashboard button hidden by Spotify's announcement banner.

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
- Request telemetry records direct Spotify Web API calls and shows a guide-style warning only when the rolling one-minute count rises past 30.

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
- Do not broaden the final-track fast polling window without considering short tracks: a long high-frequency window can generate many passive status calls.
