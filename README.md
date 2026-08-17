# Turntable iOS

A self-contained, landscape-first Spotify controller for iPhone and iPad. It is a static Progressive Web App: no laptop, LAN server, Client Secret, or Android component is used.

## Use it on iPhone or iPad

1. Open the deployed site in Safari.
2. In the Spotify Developer Dashboard, create a separate app and add the exact GitHub Pages URL shown by Turntable iOS as its Redirect URI.
3. Paste that app's **Client ID** into Turntable iOS and select **Connect Spotify**.
4. Approve Spotify access, then use Safari's **Share → Add to Home Screen**. A Shortcut can simply open the installed Home Screen app or its URL.

The app uses Spotify's Authorization Code with PKCE flow. Spotify tokens are kept only in Safari's local storage on the device. This repository intentionally contains no Client Secret, access token, or refresh token.

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
