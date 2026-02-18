# NeuroEdge Final Runbook (Web + Native + Mesh + Dashboards)

## 1) Start everything

From repo root:

```bash
bash scripts/dev-all.sh web
```

Services:

- Kernel: `http://localhost:8080/health`
- ML: `http://localhost:8090/ready`
- Orchestrator: `http://localhost:7070/health`
- Frontend: `http://localhost:5173`

## 2) Run full smoke checks

```bash
bash scripts/smoke-all.sh
```

This validates:

- core health endpoints
- authenticated chat/ai endpoints
- dashboard bootstrap endpoint
- mesh endpoints
- frontend reachability

## 3) Go-live gate

```bash
bash scripts/go-live-check.sh
```

This runs:

- orchestrator typecheck
- frontend typecheck
- kernel tests/build
- ML compile check
- native app TypeScript check
- runtime smoke checks

## 4) Native full app (Play Store path)

```bash
cd mobile/neuroedge-native
npm run bootstrap:native
npm install
cd ios && pod install && cd ..
npm run android
```

Release bundle:

```bash
cd mobile/neuroedge-native/android
./gradlew bundleRelease
```

Output:

`mobile/neuroedge-native/android/app/build/outputs/bundle/release/app-release.aab`

### Mobile update channel env vars (orchestrator)

Set in `orchestrator/.env`:

```env
MOBILE_LATEST_VERSION=1.0.0
MOBILE_MIN_SUPPORTED_VERSION=1.0.0
MOBILE_FORCE_UPDATE=false
MOBILE_PLAYSTORE_URL=https://play.google.com/store/apps/details?id=com.neuroedge.app
MOBILE_RELEASE_NOTES=Stability improvements and feature updates.
```

Served by:

`GET /mobile/app/version`

Also served (remote shell/config):

`GET /mobile/app/config`

This allows app shell/page behavior and dashboard sections to evolve from backend without mobile code rewrites.

## 5) Stop everything

```bash
bash scripts/stop-all.sh
```
