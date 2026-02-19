#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/systemd"
UNIT_DST="$HOME/.config/systemd/user"

mkdir -p "$UNIT_DST"
cp "$UNIT_SRC"/neuroedge-kernel.service "$UNIT_DST"/
cp "$UNIT_SRC"/neuroedge-ml.service "$UNIT_DST"/
cp "$UNIT_SRC"/neuroedge-orchestrator.service "$UNIT_DST"/
cp "$UNIT_SRC"/neuroedge-core.target "$UNIT_DST"/

systemctl --user daemon-reload
systemctl --user enable neuroedge-kernel.service neuroedge-ml.service neuroedge-orchestrator.service neuroedge-core.target
systemctl --user restart neuroedge-kernel.service neuroedge-ml.service neuroedge-orchestrator.service

cat <<MSG
Installed and started user services.

Useful commands:
  systemctl --user status neuroedge-kernel.service
  systemctl --user status neuroedge-ml.service
  systemctl --user status neuroedge-orchestrator.service
  journalctl --user -u neuroedge-orchestrator.service -f
  systemctl --user restart neuroedge-core.target

Optional (start on reboot without login session):
  sudo loginctl enable-linger $USER
MSG
