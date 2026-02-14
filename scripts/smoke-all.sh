#!/usr/bin/env bash
set -euo pipefail

KERNEL_API_KEY="${KERNEL_API_KEY:-change-this-now}"
KERNEL_BASE="${KERNEL_BASE:-http://localhost:8080}"
ML_BASE="${ML_BASE:-http://localhost:8090}"
ORCHESTRATOR_BASE="${ORCHESTRATOR_BASE:-http://localhost:7070}"
FRONTEND_BASE="${FRONTEND_BASE:-http://localhost:5173}"

echo "Running smoke checks..."

assert_200() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local headers=("${@:4}")
  local args=(-sS -o /tmp/neuroedge-smoke-body.txt -w "%{http_code}" -X "$method")

  for h in "${headers[@]}"; do
    args+=(-H "$h")
  done
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  args+=("$url")

  local status
  status="$(curl "${args[@]}")"
  if [[ "$status" != "200" ]]; then
    echo "Smoke failed: $url returned $status"
    cat /tmp/neuroedge-smoke-body.txt
    exit 1
  fi
  echo "OK  $url"
}

assert_200 GET "$ML_BASE/health"
assert_200 GET "$ML_BASE/readyz"
assert_200 POST "$ML_BASE/infer" '{"text":"build failed with error"}'

assert_200 GET "$KERNEL_BASE/healthz"
assert_200 GET "$KERNEL_BASE/readyz"
assert_200 GET "$KERNEL_BASE/kernel/health" "" "X-API-Key: $KERNEL_API_KEY"
assert_200 POST "$KERNEL_BASE/execute" '{"id":"smoke-kernel","type":"execute","payload":{"command":"smoke check"}}' "X-API-Key: $KERNEL_API_KEY"

assert_200 GET "$ORCHESTRATOR_BASE/status"
assert_200 GET "$ORCHESTRATOR_BASE/health"
assert_200 POST "$ORCHESTRATOR_BASE/kernels" '{}'
assert_200 POST "$ORCHESTRATOR_BASE/ai" '{"kernelId":"local","input":"build failed with error"}'
assert_200 POST "$ORCHESTRATOR_BASE/execute" '{"kernelId":"local","command":"echo smoke"}'

assert_200 GET "$FRONTEND_BASE"

echo "All services healthy."
