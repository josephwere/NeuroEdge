# NeuroEdge Core Auto-Restart Profiles

This repo now includes three ways to run core backends with recovery:

- Single startup script: `scripts/start-core.sh`
- `systemd` user services: `deploy/systemd/*`
- PM2 ecosystem: `pm2.ecosystem.config.cjs`

## 1) Single startup script

```bash
cd ~/Downloads/NeuroEdge-main
scripts/start-core.sh start
scripts/start-core.sh status
scripts/start-core.sh restart
scripts/start-core.sh stop
```

Logs are written to `/tmp/neuroedge-core`.

## 2) systemd user services (recommended on Linux)

Install and start:

```bash
cd ~/Downloads/NeuroEdge-main
scripts/install-systemd-user.sh
```

Useful commands:

```bash
systemctl --user status neuroedge-kernel.service
systemctl --user status neuroedge-ml.service
systemctl --user status neuroedge-orchestrator.service
journalctl --user -u neuroedge-orchestrator.service -f
systemctl --user restart neuroedge-core.target
```

Optional for boot-time start even before login session:

```bash
sudo loginctl enable-linger $USER
```

## 3) PM2 profile

```bash
cd ~/Downloads/NeuroEdge-main
pm2 start pm2.ecosystem.config.cjs
pm2 save
pm2 startup
```

Useful commands:

```bash
pm2 status
pm2 logs neuroedge-orchestrator
pm2 restart neuroedge-kernel neuroedge-ml neuroedge-orchestrator
```

## Notes

- Kernel/ML/Orchestrator each load local `.env` automatically.
- ML also activates `.venv` when present.
- All profiles are configured for auto-restart and backoff after failures.
