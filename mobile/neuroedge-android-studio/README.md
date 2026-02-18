# NeuroEdge Android Studio App

This folder is an Android Studio project for building a production-style NeuroEdge APK.

## What this app does

- Loads the full NeuroEdge frontend in a hardened WebView.
- Supports chat input, mic permissions, file upload, and camera access requests from the web app.
- Uses configurable URLs so you can point to local dev or production.

## Project path

`mobile/neuroedge-android-studio`

## Open in Android Studio

1. Open Android Studio.
2. Choose "Open" and select this folder:
   `mobile/neuroedge-android-studio`
3. Let Gradle sync.
4. Build APK:
   `Build > Build Bundle(s) / APK(s) > Build APK(s)`

## Configure backend/frontend URL

Edit `app/src/main/res/values/strings.xml`:

- `neuroedge_start_url`

Examples:

- Local LAN: `http://192.168.1.50:5173`
- Production: `https://app.neuroedge.ai`

## Important for local testing

- Android emulator/device cannot use your host `localhost` directly.
- Use your machine LAN IP or exposed tunnel URL.

## Permissions handled

- Internet/network state
- Microphone record
- Camera
- Read media/files (for uploads)

## iOS later

You already have iOS groundwork in:
`mobile/react-native-neuroedge-twin/ios`

When ready, we can add a matching iOS app shell (WKWebView + permissions + deep links) with the same URL and auth strategy.
