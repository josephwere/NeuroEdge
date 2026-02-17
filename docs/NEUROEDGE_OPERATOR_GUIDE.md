# NeuroEdge Operator Guide (Train, Operate, Teach)

## 1) Start Services
Run each in its own terminal.

### Kernel
```bash
cd ~/Downloads/NeuroEdge-main/kernel
set -a; source .env; set +a
go run ./cmd/api
```

### ML
```bash
cd ~/Downloads/NeuroEdge-main/ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
set -a; source .env; set +a
python server.py
```

### Orchestrator
```bash
cd ~/Downloads/NeuroEdge-main/orchestrator
pnpm install
set -a; source .env; set +a
pnpm run dev
```

### Frontend
```bash
cd ~/Downloads/NeuroEdge-main/frontend
pnpm install
set -a; source .env; set +a
pnpm run dev
```

## 2) Health Checks
```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8090/ready
curl -s http://localhost:7070/health
```

## 3) Bootstrap Domain Knowledge
In Dashboard -> Training Studio:
1. Pick RAG domain: medicine/agriculture/market.
2. Click `Trusted Seed Pack (One-Click)`.
3. Click `RAG Stats`.
4. Ask via `Ask RAG`.

## 4) Configure Nightly Refresh
In Dashboard -> Training Studio -> Auto-Refresh Config:
1. Toggle enabled.
2. Set hour/minute UTC.
3. Set stale-hours threshold.
4. Save config.
5. Optional: `Run Nightly Refresh Now`.

## 5) Feedback Loop (Continual Improvement)
- Capture outcomes from real prompts.
- Send feedback with rating:
  - up/down/neutral
- Positive feedback becomes retrieval memory candidates.

## 6) Teach Other Teams
Use this sequence:
1. Explain architecture (`docs/ARCHITECTURE_DIAGRAMS.md`).
2. Demo health and startup.
3. Demo bootstrap pack and RAG answer with citations.
4. Demo auto-refresh status/config.
5. Assign role-based operational responsibilities.

## 7) Production Checklist
- TLS + strict CORS.
- Secure JWT/API keys rotation.
- Monitoring and alerting enabled.
- Backup and restore validated.
- Canary rollout plan approved.
