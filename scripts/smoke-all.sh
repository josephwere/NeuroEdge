#!/usr/bin/env bash
set -euo pipefail

KERNEL_API_KEY="${KERNEL_API_KEY:-change-this-now}"
NEUROEDGE_API_KEY="${NEUROEDGE_API_KEY:-$KERNEL_API_KEY}"
KERNEL_BASE="${KERNEL_BASE:-http://localhost:8080}"
ML_BASE="${ML_BASE:-http://localhost:8090}"
ORCHESTRATOR_BASE="${ORCHESTRATOR_BASE:-http://localhost:7070}"
FRONTEND_BASE="${FRONTEND_BASE:-http://localhost:5173}"
ORG_ID="${ORG_ID:-personal}"
WORKSPACE_ID="${WORKSPACE_ID:-default}"
USER_ROLE="${USER_ROLE:-founder}"
USER_EMAIL="${USER_EMAIL:-founder@local}"
USER_NAME="${USER_NAME:-Founder Local}"

echo "Running NeuroEdge smoke checks..."

COMMON_AUTH_HEADERS=(
  "X-API-Key: $NEUROEDGE_API_KEY"
  "X-Org-Id: $ORG_ID"
  "X-Workspace-Id: $WORKSPACE_ID"
  "X-User-Role: $USER_ROLE"
  "X-User-Email: $USER_EMAIL"
  "X-User-Name: $USER_NAME"
)

assert_200() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  shift 3
  local headers=("$@")
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

# ML
assert_200 GET "$ML_BASE/health"
assert_200 GET "$ML_BASE/ready"
assert_200 POST "$ML_BASE/infer" '{"text":"smoke check"}'

# Kernel
assert_200 GET "$KERNEL_BASE/health"
assert_200 POST "$KERNEL_BASE/execute" '{"id":"smoke-kernel","type":"execute","payload":{"code":"echo smoke"}}' "X-API-Key: $KERNEL_API_KEY"

# Orchestrator public
assert_200 GET "$ORCHESTRATOR_BASE/status"
assert_200 GET "$ORCHESTRATOR_BASE/health"
assert_200 GET "$ORCHESTRATOR_BASE/system/status"

# Orchestrator authenticated
assert_200 POST "$ORCHESTRATOR_BASE/ai" '{"kernelId":"local","input":"hello","context":[],"style":"balanced"}' "${COMMON_AUTH_HEADERS[@]}"
assert_200 POST "$ORCHESTRATOR_BASE/chat" '{"kernelId":"local","message":"hello from smoke"}' "${COMMON_AUTH_HEADERS[@]}"
assert_200 GET "$ORCHESTRATOR_BASE/admin/dashboard/bootstrap" "" "${COMMON_AUTH_HEADERS[@]}"
assert_200 GET "$ORCHESTRATOR_BASE/mesh/nodes" "" "${COMMON_AUTH_HEADERS[@]}"
assert_200 POST "$ORCHESTRATOR_BASE/mesh/infer" '{"input":"mesh smoke","context":[]}' "${COMMON_AUTH_HEADERS[@]}"

# Frontend
assert_200 GET "$FRONTEND_BASE"

echo "All services healthy and core endpoints reachable."
