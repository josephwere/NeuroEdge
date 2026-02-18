# Play Store Deployment (NeuroEdge Native)

## 1) Bootstrap native project

```bash
cd mobile/neuroedge-native
npm run bootstrap:native
npm install
cd ios && pod install && cd ..
```

## 2) Android keystore (one-time)

```bash
cd mobile/neuroedge-native/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore neuroedge-release-key.keystore -alias neuroedge -keyalg RSA -keysize 2048 -validity 10000
```

## 3) Gradle signing config

Use automated script:

```bash
cd mobile/neuroedge-native
NEUROEDGE_UPLOAD_STORE_FILE=/absolute/path/to/your-keystore.jks \
NEUROEDGE_UPLOAD_STORE_PASSWORD=YOUR_PASSWORD \
NEUROEDGE_UPLOAD_KEY_ALIAS=neuroedge \
NEUROEDGE_UPLOAD_KEY_PASSWORD=YOUR_PASSWORD \
bash scripts/setup-release-signing.sh
```

## 4) Build AAB

```bash
cd mobile/neuroedge-native/android
./gradlew bundleRelease
```

Output:

`mobile/neuroedge-native/android/app/build/outputs/bundle/release/app-release.aab`

## 5) Upload to Play Console

- Create app in Google Play Console
- Upload `app-release.aab`
- Complete Data Safety + Content Rating + Privacy Policy
- Roll out internal test track first

## 6) Continuous bundle pipeline (GitHub Actions)

Use `.github/workflows/mobile-native-release.yml`.

Add these repo secrets:

- `NEUROEDGE_UPLOAD_KEYSTORE_BASE64`
- `NEUROEDGE_UPLOAD_STORE_PASSWORD`
- `NEUROEDGE_UPLOAD_KEY_ALIAS`
- `NEUROEDGE_UPLOAD_KEY_PASSWORD`
