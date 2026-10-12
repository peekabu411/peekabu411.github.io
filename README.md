
https://github.com/user-attachments/assets/50b9e88e-2e73-4a06-b907-3b2b3fb46cc0

[![Star this repo](https://img.shields.io/github/stars/peekabu411/peekabu411.github.io?style=for-the-badge&logo=github&label=Star%20this%20repo&color=1ed760)](https://github.com/peekabu411/peekabu411.github.io)

# Turntable iOS

A self-contained, landscape-first Spotify controller for iPhone and iPad. It is a static Progressive Web App: no laptop, LAN server, Client Secret, or Android component is used.

## Use it on iPhone or iPad

1. Open the deployed site in Safari.
2. In the Spotify Developer Dashboard, create a separate app and add the exact GitHub Pages URL shown by Turntable iOS as its Redirect URI.
3. Paste that app's **Client ID** into Turntable iOS and select **Connect Spotify**.
4. Approve Spotify access, then use Safari's **Share → Add to Home Screen**. A Shortcut can simply open the installed Home Screen app or its URL.

The app uses Spotify's Authorization Code with PKCE flow. Spotify tokens are kept only in Safari's local storage on the device. This repository intentionally contains no Client Secret, access token, or refresh token.

### Liked Songs

Tap the heart in the player's top-left corner to save the current song to Spotify's Liked Songs. It is separate from the artwork, opposite the Spotify shortcut, and keeps its larger 44px size. A green heart means saved; tap again to remove it. Older connections are asked to approve `user-library-modify` once. Podcasts and local files cannot be saved this way. The Liked Songs card refreshes on your next visit to Playlists.

### Connection security

Unpairing removes saved Spotify tokens, pending sign-in state, and cached playback on this device. Other open tabs on the same origin also disconnect. This does not revoke the app's permission in your Spotify account; remove that permission in Spotify's account settings if needed.

OAuth callback parameters are removed from the address bar, and the service worker does not cache callback or API URLs. A Content Security Policy restricts scripts and external resources. As a static GitHub Pages app, Turntable still keeps tokens in JavaScript-accessible browser storage to remember your connection. Never add a Client Secret or other server secret to frontend code or frontend environment variables.

## Development

Static files can be served with any local web server. Do not use `file://`: Spotify requires an exact HTTPS Redirect URI in production.

## Features

- Landscape-first album-art turntable interface
- Direct Spotify sign-in and token refresh with PKCE
- Playback, seeking, volume, next/previous, and Connect-device controls
- Optional synced/plain lyric lookup from LRCLIB
- Home Screen/PWA shell and offline app assets

## Notes

Spotify Premium and an active Spotify Connect playback device are required for playback control. This is an independent app—not affiliated with or endorsed by Spotify. If Spotify artwork or metadata is shown, retain the required Spotify attribution when preparing a production release.
