#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== NeuroEdge Go-Live Check =="
echo "Root: $ROOT"

echo ""
echo "[1/6] Orchestrator typecheck..."
pnpm -C "$ROOT/orchestrator" run typecheck

echo ""
echo "[2/6] Frontend typecheck..."
pnpm -C "$ROOT/frontend" run typecheck

echo ""
echo "[3/6] Kernel build check..."
(
  cd "$ROOT/kernel"
  go test ./... >/tmp/neuroedge-kernel-test.log 2>&1 || {
    echo "Kernel tests/build failed. Log: /tmp/neuroedge-kernel-test.log"
    cat /tmp/neuroedge-kernel-test.log
    exit 1
  }
)

echo ""
echo "[4/6] ML python compile check..."
(
  cd "$ROOT/ml"
  if [[ -f .venv/bin/activate ]]; then
    source .venv/bin/activate
  fi
  python -m compileall . >/tmp/neuroedge-ml-compile.log 2>&1 || {
    echo "ML compile failed. Log: /tmp/neuroedge-ml-compile.log"
    cat /tmp/neuroedge-ml-compile.log
    exit 1
  }
)

echo ""
echo "[5/6] Mobile native TypeScript check..."
if [[ -f "$ROOT/mobile/neuroedge-native/package.json" ]]; then
  pnpm -C "$ROOT/mobile/neuroedge-native" install
  pnpm -C "$ROOT/mobile/neuroedge-native" run typecheck
fi

echo ""
echo "[6/6] Runtime smoke checks..."
bash "$ROOT/scripts/smoke-all.sh"

echo ""
echo "PASS: Go-live checks completed successfully."
