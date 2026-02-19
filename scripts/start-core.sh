#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${NEUROEDGE_LOG_DIR:-/tmp/neuroedge-core}"
PID_DIR="${NEUROEDGE_PID_DIR:-/tmp/neuroedge-core}"

mkdir -p "$LOG_DIR" "$PID_DIR"

start_one() {
  local name="$1"
  shift
  local pidfile="$PID_DIR/${name}.pid"
  local logfile="$LOG_DIR/${name}.log"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return 0
  fi

  echo "Starting $name..."
  nohup "$@" >"$logfile" 2>&1 &
  echo $! >"$pidfile"
}

stop_one() {
  local name="$1"
  local pidfile="$PID_DIR/${name}.pid"
  if [[ ! -f "$pidfile" ]]; then
    echo "$name not running"
    return 0
  fi

  local pid
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (pid $pid)..."
    kill "$pid" || true
  fi
  rm -f "$pidfile"
}

status_one() {
  local name="$1"
  local pidfile="$PID_DIR/${name}.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name: running (pid $(cat "$pidfile"))"
  else
    echo "$name: stopped"
  fi
}

start_all() {
  start_one "kernel" bash -lc "cd '$ROOT/kernel' && [[ -f .env ]] && set -a && source .env && set +a || true && exec go run ./cmd/api"
  start_one "ml" bash -lc "cd '$ROOT/ml' && [[ -f .venv/bin/activate ]] && source .venv/bin/activate || true && [[ -f .env ]] && set -a && source .env && set +a || true && exec python server.py"
  start_one "orchestrator" bash -lc "cd '$ROOT/orchestrator' && [[ -f .env ]] && set -a && source .env && set +a || true && exec pnpm run dev"

  echo "Core services started. Logs: $LOG_DIR"
}

stop_all() {
  stop_one "orchestrator"
  stop_one "ml"
  stop_one "kernel"
}

status_all() {
  status_one "kernel"
  status_one "ml"
  status_one "orchestrator"
}

cmd="${1:-start}"
case "$cmd" in
  start) start_all ;;
  stop) stop_all ;;
  restart) stop_all; sleep 1; start_all ;;
  status) status_all ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
