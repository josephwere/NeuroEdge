#!/usr/bin/env bash
set -euo pipefail

PID_DIR="/tmp/neuroedge"

stop_one() {
  local name="$1"
  local pidfile="$PID_DIR/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)"
      kill "$pid" || true
    fi
    rm -f "$pidfile"
  fi
}

stop_one "frontend"
stop_one "desktop"
stop_one "orchestrator"
stop_one "ml"
stop_one "kernel"

echo "Stopped."
