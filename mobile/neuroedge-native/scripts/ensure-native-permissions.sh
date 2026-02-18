#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"
IOS_PLIST="$ROOT/ios/NeuroEdgeNative/Info.plist"

if [[ -f "$ANDROID_MANIFEST" ]]; then
  if ! grep -q 'android.permission.RECORD_AUDIO' "$ANDROID_MANIFEST"; then
    perl -0pi -e 's#<manifest([^>]*)>#<manifest$1>\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.INTERNET" />#s' "$ANDROID_MANIFEST"
  fi
fi

if [[ -f "$IOS_PLIST" ]]; then
  if ! grep -q 'NSMicrophoneUsageDescription' "$IOS_PLIST"; then
    perl -0pi -e 's#</dict>#  <key>NSMicrophoneUsageDescription</key>\n  <string>NeuroEdge uses microphone for voice input.</string>\n  <key>NSSpeechRecognitionUsageDescription</key>\n  <string>NeuroEdge uses speech recognition for voice commands.</string>\n</dict>#s' "$IOS_PLIST"
  fi
fi

echo "Native permissions patched."
