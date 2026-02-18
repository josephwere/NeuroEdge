# NeuroEdge Twin Sample App (React Native)

This sample app imports `@neuroedge/react-native-twin` and runs the mobile action pump at startup.

## 1) Generate Android + iOS native project files

```bash
cd mobile/react-native-neuroedge-twin/sample-app
npm run bootstrap:native
```

This creates `android/` and `ios/` folders from the RN template.

## 2) Install dependencies

```bash
npm install
cd ios && pod install && cd ..
```

## 3) Configure app values

Edit `src/App.tsx`:

- `ORCHESTRATOR_URL`
- API key / auth headers
- `device.id`, platform, attestation metadata

Tip:

- Android emulator -> use `http://10.0.2.2:7070`
- iOS simulator -> use `http://localhost:7070`

## 4) Run

```bash
npm run android
# or
npm run ios
```

## What this app does

- Registers the device into `/dashboard/twin/mobile/device/register`
- Syncs capabilities and permissions
- Polls `/dashboard/twin/mobile/actions/pending`
- Executes native handler bridge methods
- Posts receipts to `/dashboard/twin/mobile/action/receipt`
