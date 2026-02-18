#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_GRADLE="$ANDROID_DIR/app/build.gradle"
KEYSTORE_DEST="$ANDROID_DIR/app/neuroedge-release.keystore"

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "android/ not found. Run: npm run bootstrap:native"
  exit 1
fi

if [[ ! -f "$APP_GRADLE" ]]; then
  echo "Missing $APP_GRADLE"
  exit 1
fi

if [[ -z "${NEUROEDGE_UPLOAD_STORE_FILE:-}" || -z "${NEUROEDGE_UPLOAD_STORE_PASSWORD:-}" || -z "${NEUROEDGE_UPLOAD_KEY_ALIAS:-}" || -z "${NEUROEDGE_UPLOAD_KEY_PASSWORD:-}" ]]; then
  cat <<'EOF'
Set these env vars before running:
  NEUROEDGE_UPLOAD_STORE_FILE=/absolute/path/to/your-keystore.jks
  NEUROEDGE_UPLOAD_STORE_PASSWORD=...
  NEUROEDGE_UPLOAD_KEY_ALIAS=...
  NEUROEDGE_UPLOAD_KEY_PASSWORD=...
EOF
  exit 1
fi

cp "$NEUROEDGE_UPLOAD_STORE_FILE" "$KEYSTORE_DEST"
chmod 600 "$KEYSTORE_DEST"

if ! grep -q "def neuroedgeKeystorePropertiesFile" "$APP_GRADLE"; then
  cat >>"$APP_GRADLE" <<'EOF'

def neuroedgeKeystorePropertiesFile = rootProject.file("keystore.properties")
def neuroedgeKeystoreProperties = new Properties()
if (neuroedgeKeystorePropertiesFile.exists()) {
    neuroedgeKeystoreProperties.load(new FileInputStream(neuroedgeKeystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (neuroedgeKeystoreProperties["storeFile"]) {
                storeFile file(neuroedgeKeystoreProperties["storeFile"])
                storePassword neuroedgeKeystoreProperties["storePassword"]
                keyAlias neuroedgeKeystoreProperties["keyAlias"]
                keyPassword neuroedgeKeystoreProperties["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
EOF
fi

cat >"$ANDROID_DIR/keystore.properties" <<EOF
storeFile=app/neuroedge-release.keystore
storePassword=${NEUROEDGE_UPLOAD_STORE_PASSWORD}
keyAlias=${NEUROEDGE_UPLOAD_KEY_ALIAS}
keyPassword=${NEUROEDGE_UPLOAD_KEY_PASSWORD}
EOF
chmod 600 "$ANDROID_DIR/keystore.properties"

echo "Release signing configured."
