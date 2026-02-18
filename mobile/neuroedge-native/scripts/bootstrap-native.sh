#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
APP_NAME="NeuroEdgeNative"
RN_VERSION="${RN_VERSION:-0.74.5}"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "[bootstrap-native] generating Android/iOS project files with React Native ${RN_VERSION} ..."
npx @react-native-community/cli@"${RN_VERSION}" init "${APP_NAME}" \
  --directory "${TMP_DIR}" \
  --skip-install \
  --version "${RN_VERSION}" >/dev/null

echo "[bootstrap-native] copying native folders ..."
rm -rf "${ROOT_DIR}/android" "${ROOT_DIR}/ios"
cp -R "${TMP_DIR}/android" "${ROOT_DIR}/android"
cp -R "${TMP_DIR}/ios" "${ROOT_DIR}/ios"

for f in Gemfile .watchmanconfig; do
  if [[ -f "${TMP_DIR}/${f}" ]]; then
    cp "${TMP_DIR}/${f}" "${ROOT_DIR}/${f}"
  fi
done

echo "[bootstrap-native] done."
echo "[bootstrap-native] applying native permission patches ..."
bash "${ROOT_DIR}/scripts/ensure-native-permissions.sh"

echo "Next:"
echo "  cd ${ROOT_DIR}"
echo "  npm install"
echo "  cd ios && pod install && cd .."
echo "  npm run android   # or npm run ios"
