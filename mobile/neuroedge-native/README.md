# NeuroEdge Native App

This is a real React Native client (not a WebView wrapper) for NeuroEdge, designed for Play Store and App Store packaging.

## Features included

- Native chat UI with local chat history persistence
- New chat, switch chat, continue chat flows
- Native pages for `main_chat`, `floating_chat`, `my_chats`, `projects`, `history`, `extensions`, `dashboard`, `settings` (role/plan gated by server config)
- Trust metadata rendering under responses (`why`, freshness, quality score, contradiction risk)
- Founder/Admin parity dashboard blocks pulled from orchestrator endpoints
- Backend config panel (URL, API key, bearer token, role/workspace headers)
- Real native file picker (`react-native-document-picker`)
- Real speech-to-text hook (`@react-native-voice/voice`)
- Twin mobile action pump integration via `@neuroedge/react-native-twin`
- Remote shared app config + version gate (`/app/config?client=android|ios`, `/app/version?client=android|ios`)

## 1) Generate Android/iOS native folders

```bash
cd mobile/neuroedge-native
npm run bootstrap:native
```

Bootstrap also auto-patches Android/iOS permissions for microphone + speech recognition.

## 2) Install dependencies

```bash
npm install
cd ios && pod install && cd ..
```

## 3) Run

```bash
npm run android
# or
npm run ios
```

## 4) Configure backend

Open Settings in-app and set:

- `Orchestrator URL` (for Android emulator use `http://10.0.2.2:7070`)
- API key / bearer token / role / workspace headers

Mobile runtime config endpoints are server-driven, so future backend upgrades can change app shell behavior without code edits.
When `kernel/ml/orchestrator/frontend` features evolve, expose them through orchestrator API + `/app/config` and the native app can adopt those flows without rewriting core navigation code.

## Play Store release notes

Use Android App Bundle from generated native Android project:

```bash
cd mobile/neuroedge-native/android
./gradlew bundleRelease
```

Bundle output:

`mobile/neuroedge-native/android/app/build/outputs/bundle/release/app-release.aab`

Release signing setup:

```bash
cd mobile/neuroedge-native
NEUROEDGE_UPLOAD_STORE_FILE=/abs/path/keystore.jks \
NEUROEDGE_UPLOAD_STORE_PASSWORD=... \
NEUROEDGE_UPLOAD_KEY_ALIAS=... \
NEUROEDGE_UPLOAD_KEY_PASSWORD=... \
bash scripts/setup-release-signing.sh
bash scripts/build-release.sh
```
