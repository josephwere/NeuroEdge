# NeuroEdge

NeuroEdge is a local-first AI runtime with four services:
- `frontend` (Vite/React UI)
- `orchestrator` (TypeScript coordination layer)
- `kernel` (Go execution/control API)
- `ml` (Python ML inference service)

## Sovereign Mode (Independent by Default)
NeuroEdge is configured to run in **local-only** mode by default:
- Orchestrator validates that `KERNEL_URL` and `ML_URL` are local addresses.
- No external AI provider calls are required for core chat/intent routing.
- ML service always provides fallback intent inference when model inference is unavailable.

## Quick Start (Local)
Run each service in its own terminal.

### 1) Kernel
```bash
cd kernel
cp .env.example .env  # first time only
set -a; source .env; set +a
go run ./cmd/api
```

### 2) ML
```bash
cd ml
cp .env.example .env  # first time only
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
set -a; source .env; set +a
python server.py
```

### 3) Orchestrator
```bash
cd orchestrator
cp .env.example .env  # first time only
pnpm install
set -a; source .env; set +a
pnpm run dev
```

### 4) Frontend
```bash
cd frontend
cp .env.example .env  # first time only
pnpm install
pnpm run dev
```

Open `http://localhost:5173`.

## Health Checks
- Kernel: `http://localhost:8080/health`
- ML: `http://localhost:8090/health`
- Orchestrator: `http://localhost:7070/health`

## Fix: `{"error":"ML inference failed"}`
If chat shows ML inference errors:
1. Make sure ML service is running on `ML_URL`.
2. Ensure orchestrator `.env` has one valid `ML_URL` entry.
3. Restart orchestrator after changing env.
4. Check `http://localhost:8090/ready` returns `status: ready`.

The ML service now supports both `/infer` and `/predict` endpoints for compatibility.

## Production Readiness Checklist
- [ ] Rotate API key and keep the same value in kernel + orchestrator.
- [ ] Do not commit real `.env` files.
- [ ] Keep `NEUROEDGE_LOCAL_ONLY=true` unless you intentionally allow remote URLs.
- [ ] Add HTTPS/TLS and reverse proxy (Nginx/Caddy) in production.
- [ ] Add process supervisor (`systemd`, `pm2`, Docker, or Kubernetes).
- [ ] Add monitoring + log retention.

## Notes
If you want to integrate external providers later, keep them as optional adapters while preserving local fallback behavior.
