#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-web}" # web | desktop
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="/tmp/neuroedge"
PID_DIR="/tmp/neuroedge"

mkdir -p "$LOG_DIR" "$PID_DIR"

run_bg() {
  local name="$1"
  shift
  local logfile="$LOG_DIR/${name}.log"
  local pidfile="$PID_DIR/${name}.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return 0
  fi

  echo "Starting $name..."
  nohup "$@" >"$logfile" 2>&1 &
  echo $! >"$pidfile"
}

echo "NeuroEdge launcher ($MODE)"

# Kernel
run_bg "kernel" bash -lc "cd \"$ROOT/kernel\" && [[ -f .env ]] && set -a && source .env && set +a || true && go run ./cmd/api"

# ML
run_bg "ml" bash -lc "cd \"$ROOT/ml\" && [[ -f .venv/bin/activate ]] && source .venv/bin/activate || true && [[ -f .env ]] && set -a && source .env && set +a || true && python server.py"

# Orchestrator
run_bg "orchestrator" bash -lc "cd \"$ROOT/orchestrator\" && pnpm install && [[ -f .env ]] && set -a && source .env && set +a || true && pnpm run dev"

if [[ "$MODE" == "desktop" ]]; then
  run_bg "desktop" bash -lc "cd \"$ROOT/frontend\" && pnpm install && pnpm tauri:dev"
else
  run_bg "frontend" bash -lc "cd \"$ROOT/frontend\" && pnpm install && pnpm run dev"
fi

echo "Logs: $LOG_DIR"
echo "Health check: scripts/smoke-all.sh"
echo "Stop all: scripts/stop-all.sh"
