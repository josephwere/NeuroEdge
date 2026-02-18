# NeuroEdge iOS Shell

This is the iOS counterpart to:

- `mobile/neuroedge-android-studio`

It packages the full NeuroEdge web app in a native iOS shell (WKWebView), so Android and iOS packaging are in the same `mobile/` workspace.

## Folder

`mobile/neuroedge-ios-shell`

## What this shell supports

- Loads full NeuroEdge UI from your configured URL
- Microphone/camera/file picker support from web content
- External links open in Safari (optional security guard)

## Configure start URL

Edit:

- `NeuroEdgeShell/App/Config.swift`

Set:

- `startURL`

Example:

- Local LAN dev: `http://192.168.1.50:5173`
- Production: `https://app.neuroedge.ai`

## Generate Xcode project (recommended)

This shell uses `xcodegen` for clean reproducible project generation.

1. Install `xcodegen`:
   - `brew install xcodegen`
2. Generate project:
   - `cd mobile/neuroedge-ios-shell`
   - `xcodegen generate`
3. Open:
   - `open NeuroEdgeShell.xcodeproj`
4. Build on device/simulator from Xcode.

## iOS deployment notes

- Add your real Team and Bundle ID in `project.yml`.
- For microphone/camera access, usage descriptions are already set in `project.yml` + `Info.plist`.
- For ATS strict production, update NSAppTransportSecurity rules before App Store release.
