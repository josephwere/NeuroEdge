# @neuroedge/react-native-twin

React Native plugin skeleton for NeuroEdge Personal Twin mobile action execution.

It is wired to the existing orchestrator endpoints:

- `GET /dashboard/twin/mobile/actions/pending`
- `POST /dashboard/twin/mobile/action/receipt`
- `POST /dashboard/twin/mobile/device/register`
- `POST /dashboard/twin/mobile/device/sync`

## Install (local workspace)

```bash
yarn add ../mobile/react-native-neuroedge-twin
# or
npm i ../mobile/react-native-neuroedge-twin
```

iOS:

```bash
cd ios && pod install
```

## Basic usage

```ts
import { NeuroEdgeTwinActionPump } from "@neuroedge/react-native-twin";

const pump = new NeuroEdgeTwinActionPump(
  {
    baseUrl: "http://localhost:7070",
    headers: {
      apiKey: "your-api-key",
      orgId: "personal",
      workspaceId: "default",
      userRole: "user",
      userEmail: "mobile@local",
      userName: "Mobile User"
    },
    device: {
      id: "mobile-dev-1",
      platform: "android",
      deviceName: "Pixel 8",
      appVersion: "1.0.0",
      osVersion: "android-14",
      attestationProvider: "android_play_integrity",
      attestationStatus: "trusted"
    }
  },
  3000
);

await pump.start();
```

## Ready-to-build sample app

Use the bundled sample at `sample-app/`:

```bash
cd sample-app
npm run bootstrap:native
npm install
cd ios && pod install && cd ..
npm run android
# or
npm run ios
```

## Where to wire real native behavior

- Android:
  - `android/src/main/java/com/neuroedgetwin/NeuroEdgeCallScreeningService.kt`
  - `android/src/main/java/com/neuroedgetwin/NeuroEdgeTwinModule.kt`
- iOS:
  - `ios/NeuroEdgeCallKitManager.swift`
  - `ios/NeuroEdgeTwinModule.swift`

Replace placeholder returns with your host app call-flow logic (CallScreeningService/CallKit/VoIP SDK).

## Notes

- This skeleton does not bypass OS restrictions.
- All call automation must be user-consented and permission-based.
- High-risk actions should keep human override and disclosure enabled.
