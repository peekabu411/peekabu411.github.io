# Turntable iOS — Project Context

## Purpose

Turntable is a standalone, installable GitHub Pages web app for iPhone/iPad. It controls Spotify through each user's own Spotify Developer Web API application and Client ID. It is intentionally separate from the original LAN remote and Android projects.

## Live app and repository

- Live app: https://peekabu411.github.io/
- Repository: https://github.com/peekabu411/peekabu411.github.io
- Local project folder: `C:\Users\Luigi Mendoza\OneDrive\Documents\New project\peekabu411.github.io`
- Default branch: `main`
- Current release/version: `ver(I.10.7)` (tag `vI.9.9` is the last pushed tag; tags could not be pushed from the cloud). Every publish gets a new number; never reuse one. I.9.10-I.9.19 already appear in the old update log, so patch releases use I.9.9.x.

## Current deployed state

- Latest deployed release is tracked by the active version/tag above and GitHub Pages build status.
- I.10.7 Smart Mix (2026-11-26): Spotify's Web API cannot turn on Smart Shuffle, and dev-mode apps lost recommendations/related artists (Nov 2024) and artist top tracks (Feb 2026). Hold Shuffle for a menu: Shuffle off / Shuffle / Smart Mix / "Smart Shuffle in Spotify" (opens the current playlist at open.spotify.com). `smart-mix.js`/`.css` plus `turntableSpotify.smartMixSource()`/`smartMixQueue()` in bridge.js add one pick to the Spotify queue after every 3 songs while Turntable is open, rotating through the current artist's albums, `/me/top/tracks`, Liked Songs and recently played. Picks skip the current song, the visible queue, Smart Mix's picks from the last 24 hours and songs played in the last 3 hours; they are tagged SMART PICK in the queue drawer (`row.dataset.uri` in app/queue.js). Hooks: `turntableSmartMix.syncPlayback` in app/player.js `render`. Turning shuffle off ends Smart Mix. New scopes `user-top-read user-read-recently-played`; older connections still get picks from Liked Songs and the artist and see an "Allow top songs & recent plays" row. localStorage `turntable-smart-mix`, `turntable-smart-mix-history`. `tests/smart-mix-browser.cjs` (mocked Spotify; no real-account test yet).
- I.10.0 (2026-11-25, first planned as I.9.9.3): polish pass. Leftover PC/LAN copy replaced (context fallback "NOW PLAYING", connection/status strings, <title> "Turntable"); the Devices LAN pairing card is now a "This device / Disconnect Spotify" card (`#unpair-phone` kept), `/api/pairing-info` route and copy-address handler removed. New last-loaded `refinements.css`: title clamps to 2 lines with ellipsis (no third-line leak), compact layout keeps the title 48px clear of the dial hint, SE-width Settings hides "Press for tabs" off Now Playing and moves preset tools clear of the tab arrow, hardware logo hidden on Now Playing, iPad (coarse pointer, wide, Song info, control bar shown) artwork min(46vh,36vw,440px), readable segment subtitles. bridge.js downloads app scripts in parallel (async=false keeps order). All stylesheets now carry ?v=; unused manifest.webmanifest removed. Also folds in the Divider hidden-bar redesign (control bar thread, 236a022, replacing 8376298): the progress line is a centred mini player pill with times above the home bar; tap or drag lifts a full-width scrubber that tucks away on release.
- I.9.9.2 (2026-11-25): hidden control bar refinements (plain play icon, wider spacing, Divider line closer to the edge, lyrics-placement row anchored to lyric text when the volume control is swiped away) plus the tour tab-row/fingertip update. The tour release below is logged as I.9.9.1.
- I.9.9 spotlight tour (2026-11-25): the Now Playing guide is now a spotlight on the real player (`now-playing-tour.js`/`.css`, `window.turntableTour`). The welcome card only offers it; Start tour and Settings > Now Playing tour run it. Seven steps (artwork, heart, timeline, playback/compact row, volume dial or bar incl. 1/2/3-tap gestures and swipe-away, tabs row opened live then restored, Spotify shortcut); copy follows album/control/playback-bar/control-bar styles and skips controls not on screen. The overlay blocks touches underneath and sends no Spotify requests. Storage key bumped to `turntable-now-playing-guide-v2` so people who saw the old cards get the tour once. `tests/now-playing-tour-browser.cjs` covers it.
- I.9.9 hidden control bar (2026-11-25): new Settings > Playback > Control bar (Shown/Hidden), saved per preset (`controlBar` in preset settings, `turntable-control-bar` in localStorage). `control-bar.js`/`.css` move the existing `.transport` buttons plus `#queue-toggle` into one compact row: Default playback bar puts it between the elapsed/total times; Divider puts it under the artist (`.track-copy`), or under the lyrics panel in lyrics mode, and pins a thicker progress line to the bottom edge above the iPhone home indicator. Artwork grows about 26% on iPhone 13 Pro (limited by screen height) and about 30% on iPad/desktop, the volume dial/bar extends to the bottom. While hidden, a quick tap on the artwork plays/pauses (flash `#art-tap-feedback`, hint `.tap-play-hint`). Gestures: swipe down on the bar hides it; swipe up from the bottom 76px brings it back. `tests/control-bar-browser.cjs` covers it. Shown mode is pixel-identical to I.9.8.
- I.9.8 iPhone Home Screen startup/resume maintenance (2026-11-03): user reports a large bottom gap on iPhone 13 Pro after opening the app hours/a day later; rotating clears it. New `viewport-resume.js`/`.css` measure the unzoomed window/visual viewport on fresh startup, pageshow, visibility return, focus, and rotation. A bounded 3-second settling burst catches delayed OS geometry even without resize; work cancels when hidden and there is no continuous polling, reload, saved size, or Spotify request. Only installed iPhone/iPod shells use the measured height; normal safe-area padding and all design settings remain unchanged. Keyboard/editing and pinch-zoom measurements are skipped. Seven deterministic unit tests and an isolated browser reproduction verify a simulated 54px gap is corrected after late startup/resume, rotation works, no added requests/reloads occur, and existing security/playback/Liked Songs checks pass. This does not prove the intermittent physical-iOS issue is fixed; the user's next hours-later launch is the remaining real-device verification. WebKit also has reported system-owned viewport gaps that a page cannot reliably address, so do not promise all iOS shell bugs are resolved.
- I.9.8 heart placement refinement: the heart is now an independent direct child of the player shell in its top-left corner, opposite the Spotify shortcut, not an artwork overlay. It keeps the larger 44px size requested by the user. Its top/side offsets follow the Spotify shortcut (including short-landscape and safe-area offsets), and it hides outside Now Playing. Save/remove behavior is unchanged.
- I.9.8 song likes maintenance: a fixed heart at the artwork's top-left saves/removes the actual current Spotify song via the documented `/me/library` endpoints. Green means saved. Requests are authenticated, track URIs validated, and older connections explicitly approve `user-library-modify` via a guide-style reconnect dialog. The heart is outside the spinning/swiping cover and works with square and vinyl artwork. Same-track status polls do not repeat library reads; results cache for 60 seconds, delayed responses cannot paint another track, and failed writes retain confirmed state. Successful writes invalidate the Liked Songs count/card for its next visit. Podcasts/local tracks are disabled. Static security protections and I.9.8 version remain unchanged. Tests cover saves/removals, scope migration, track races, failed writes, and phone/tablet placement using mocked Spotify responses; real-account library writes have not been tested.
- I.9.8 security maintenance: Unpair clears OAuth tokens, pending PKCE state, and cached playback; other tabs disconnect when credentials are removed. Token refresh is single-flight and cannot restore a disconnected session. OAuth callback parameters are stripped immediately and cannot be cached by the service worker. Errors/diagnostic values render as text, and CSP/referrer policies restrict scripts and external resources. Saved login still uses browser localStorage by user choice (static GitHub Pages, no backend). Security changes are isolated in the sibling `turntable-security` checkout to preserve unfinished local designs in the primary checkout.
- I.9.8 extends the corrected full-screen Wide layout to coarse-pointer landscape viewports from 1000 × 650 upward, covering iPad mini and larger tablets while preserving the original large-phone layout below that combined threshold. Its maintenance update also adds a synthetic Liked Songs card backed by Spotify's saved-track count and full collection playback; existing connections authorize the new `user-library-read` and `user-read-private` scopes once by tapping that card.
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
- Liked Songs appears as a first-class playlist card, supports the same pin/reorder UI, and starts the user's full saved-song collection with a 100-track URI fallback if Spotify rejects collection-context playback.
- Setup flow ordered as: sign in, copy redirect URI, create/choose app, copy Client ID, paste Client ID, connect Spotify.
- Internal update log and diagnostics are present in Settings.
- Interaction hints include “PRESS FOR TABS” and “SWIPE ↕ TO ADJUST.”
- Request telemetry records direct Spotify Web API calls and shows a guide-style warning only when the rolling one-minute count rises past 30.

## Important files

- `index.html` — page structure, setup flow, current version text, update log.
- `app/*.js` — the app, split by area and loaded in order by `bridge.js` (`APP_SCRIPTS`): `core.js` (state, `api()` wrapper, snapshot), `artwork.js`, `lyrics.js`, `shell.js` (views, dialogs, appearance), `queue.js`, `playlists.js`, `devices.js`, `player.js` (rendering, status refresh, playback), `controls.js` (buttons, gestures, startup). They are classic scripts sharing top-level names, so a top-level statement may only call functions from its own or earlier files.
- `settings-schema.js` — every setting once (key, values, default, limits); used by the app and presets.
- `bridge.js` — sign-in (PKCE) and `window.turntableSpotify`, the only Spotify client.
- `styles.css` — primary app styles.
- `viewport-resume.js`, `viewport-resume.css` — narrowly scoped iPhone Home Screen startup/resume measured-height recovery; CSS loaded last, no API requests.
- `desktop-layout.css` — final stylesheet loaded by `index.html`; use this for critical iOS layout overrides.
- `screen-fit.css`, `settings-help.css`, `settings-help-previews.css`, `preset-controls.css` — supplemental styling.
- `manifest.json` and `icons/` — installed web-app identity.

## Styling and cache notes

- Stylesheets load in this order: `styles.css`, `settings-help.css`, `settings-help-previews.css`, `screen-fit.css`, `preset-controls.css`, `desktop-layout.css`.
- A style in an earlier stylesheet can be overridden later. For critical final layout overrides, add scoped rules to `desktop-layout.css`.
- Do not edit `?v=` tags by hand. Add the newest `<b>ver(I.x.y)</b>` entry at the top of the update log in `index.html`, then run `node tools/release.cjs I.x.y`: it stamps every stylesheet and script in `index.html` and `bridge.js` with `?v=I.x.y`, sets the Settings version button, and rebuilds the `sw.js` cache name and offline file list. `tests/release.test.cjs` fails if anything disagrees or a version number is reused.
- The end of `styles.css` used to hold ~6 KB of rules that never applied (a missing `)` in the marquee keyframes swallowed them). They were removed in I.10.1; the lyrics marquee keyframes still have an empty `to{}` because that is how browsers always read them.
- The last setup fix intentionally removes `.setup-action` from the Step 3/4 arrow links because that shared class makes regular setup actions full-width.

## Release and deployment workflow

1. Make scoped changes in this repository. Gates for every change: `node --test tests/*.test.cjs`, the browser tests including `tests/feature-smoke-browser.cjs`, and `node tests/visual-snapshot.cjs capture` on main and on the branch followed by `compare` (60 screens over five device sizes).
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
