#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-desktop}" # desktop | web
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

echo "NeuroEdge dev launcher ($MODE)"

# Kernel (Go)
run_bg "kernel" bash -lc "cd \"$ROOT/kernel\" && set -a && source .env && set +a && go run ./cmd/api"

# ML (Python venv required)
run_bg "ml" bash -lc "cd \"$ROOT/ml\" && source .venv/bin/activate && set -a && source .env && set +a && python server.py"

# Orchestrator (Node)
run_bg "orchestrator" bash -lc "cd \"$ROOT/orchestrator\" && pnpm install && set -a && source .env && set +a && pnpm run dev"

if [[ "$MODE" == "web" ]]; then
  # Frontend (web)
  run_bg "frontend" bash -lc "cd \"$ROOT/frontend\" && pnpm install && pnpm run dev"
else
  # Desktop (Tauri) - this will start Vite automatically
  run_bg "desktop" bash -lc "cd \"$ROOT/frontend\" && pnpm install && pnpm tauri:dev"
fi

echo "Logs: $LOG_DIR"
echo "Stop with: scripts/stop-all.sh"
