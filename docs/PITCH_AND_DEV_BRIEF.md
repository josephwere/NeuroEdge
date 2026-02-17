# NeuroEdge Pitch + Developer Brief

## One-line Positioning
NeuroEdge is a sovereign AI runtime with orchestrated kernel execution, domain intelligence, and continuously refreshed retrieval knowledge.

## What is Built (Current)
- Multi-service stack:
  - Frontend (React/Vite)
  - Orchestrator (Node/TypeScript)
  - ML service (FastAPI/Python)
  - Kernel (Go)
- Domain intelligence:
  - medicine, agriculture/forestry, market/business
- RAG:
  - ingest/search/answer/feedback/reindex
  - citations and confidence
- Trusted bootstrap packs:
  - medicine/agriculture/market curated source sets
- Auto-refresh:
  - nightly scheduled, stale-source aware
  - runtime-configurable from dashboard

## Business Value
- Faster answer quality ramp without waiting for full model retraining.
- Founder/admin can operate knowledge refresh from UI.
- Safer enterprise posture with explicit roles/scopes and governance endpoints.

## Why It Differentiates
- Hybrid operation: orchestration + kernel + ML + persistent event state.
- UI-managed operations for non-code governance.
- Progressive path: retrieval-first quality gains now, model training hardening later.

## Current GTM Narrative
1. Launch as developer-assistant + domain copilot.
2. Expand to enterprise controls (roles, integrations, policy).
3. Scale with mesh inference and federated learning controls.

## Developer Takeaways
- Primary control plane: orchestrator APIs.
- Domain answering path:
  - `/ai` -> domain detect -> `/rag/answer` or `/intelligence/ask`
- RAG quality loop:
  - `ingest -> index -> answer -> feedback -> reindex`
- Governance:
  - founder/admin endpoints protected with scope+role checks.
