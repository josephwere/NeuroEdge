# NeuroEdge Capability Status

This file tracks requested capabilities and current implementation state.

## 1) Self-Expansion System

### Implemented
- Workspace analysis endpoint:
  - `GET /self-expansion/analyze`
  - Analyzes folder structure, backend/frontend footprint, database artifacts.
- Proposal endpoint:
  - `POST /self-expansion/propose`
  - Suggests architecture improvements, module candidates, and version upgrade direction.
- Module generation endpoint (confirmation-gated):
  - `POST /self-expansion/generate-module`
  - Generates module previews and writes files only when:
    - `confirm=true`
    - `SELF_EXPANSION_ALLOW_WRITE=true`

### Safety guarantees (enforced)
- No silent production rewrites by default.
- No self-deploy behavior.
- Human confirmation required for writes.
- Doctrine shield validates expansion payloads before generation.

## 2) Security & Doctrine Shield

### Implemented
- Input validation:
  - JSON body size limit via `MAX_JSON_BODY` (default `1mb`).
- Rate limiting:
  - Existing per-route limiters retained for AI/research/training/execute.
- File type verification:
  - Self-expansion generator enforces allowed extensions:
  - `.ts, .tsx, .js, .md, .json, .sh`
- SQL/prompt-injection protection:
  - Doctrine rules include pattern checks for prompt and SQL attacks.
  - Rejections return a doctrine error with matched rule.
- AI guardrails:
  - Existing risky command policy in execution path.
  - Doctrine checks applied globally to mutating routes.
- Admin audit logs:
  - `GET /admin/audit` (filtered security/admin/doctrine/expansion events).

### Doctrine system
- Versioned rules persisted in:
  - `orchestrator/data/doctrine_rules.json`
- Rule APIs:
  - `GET /doctrine/rules`
  - `POST /doctrine/rules`
- Doctrine applies system-wide on non-GET routes via middleware.
- Malicious expansion attempts are rejected and logged.

## 3) Admin Panel Feature Coverage

### Implemented APIs
- View logs:
  - `GET /admin/logs`
- View usage:
  - `GET /admin/usage`
- Monitor agents:
  - `GET /admin/agents`
- Restart services (operator-confirmed/manual safe mode):
  - `POST /admin/restart`
  - Returns safe restart instructions; no automatic restart.
- View system metrics:
  - `GET /admin/system/metrics`
- Memory usage:
  - Included in `/admin/system/metrics`
- Version tracking:
  - `GET /admin/version`
  - Includes orchestrator version, state version, doctrine version.

## 4) Existing capabilities retained
- Prometheus metrics endpoint: `GET /metrics`
- Langfuse/Helicone tracing: `src/observability/tracing.ts`
- Token usage and billing summaries.
- JWT auth, scopes, workspaces.

## 5) Environment flags
- `DOCTRINE_ENFORCE=true|false`
- `SELF_EXPANSION_ALLOW_WRITE=true|false`
- `MAX_JSON_BODY=1mb` (or custom)

