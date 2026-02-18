#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT/android" ]]; then
  echo "android/ not found. Run: npm run bootstrap:native"
  exit 1
fi

cd "$ROOT/android"
./gradlew clean bundleRelease

echo "AAB:"
echo "$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
