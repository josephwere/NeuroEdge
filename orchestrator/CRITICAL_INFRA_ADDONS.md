# NeuroEdge Critical Infra Add-Ons

## Added and Wired

### Security
- JWT auth middleware: `src/security/auth.ts`
- Org/workspace context on every request: `req.auth.orgId`, `req.auth.workspaceId`
- Route permission scopes: `src/security/scope.ts`

### Observability
- Prometheus metrics endpoint: `GET /metrics`
- HTTP latency/request counters + token counters: `src/observability/metrics.ts`
- LLM tracing hooks to Langfuse/Helicone (when env keys are set): `src/observability/tracing.ts`
- Grafana starter dashboard JSON: `observability/grafana-dashboard.json`

### Billing
- Token usage tracking and summaries: `src/billing/usage.ts`
- Stripe meter event reporting (optional): `src/billing/stripe_meter.ts`
- Usage endpoint: `GET /billing/usage`

### Web Research
- Research pipeline endpoint: `POST /research`
- Flow: query -> web search -> page fetch -> parse -> summary with citations
- Safety controls:
  - Domain allowlist via `RESEARCH_ALLOWLIST`
  - Request rate limit via `RESEARCH_RATE_LIMIT_*`
  - Fetch timeout and page caps via `RESEARCH_HTTP_TIMEOUT_MS`, `RESEARCH_MAX_*`

### Training Data Pipeline
- Feedback ingestion endpoint: `POST /training/feedback`
- Sample listing endpoint: `GET /training/samples`
- JSONL export endpoint: `GET /training/export`

## Scope Model

Supported scope examples:
- `chat:write`
- `execute:run`
- `ai:infer`
- `storage:write`
- `billing:read`
- `mesh:read`, `mesh:write`
- `federation:read`, `federation:write`
- `admin:*` or `*`

## Safe Defaults

Current `.env` defaults are now strict production-style:
- `AUTH_REQUIRED=true`
- `AUTHZ_ENFORCE_SCOPES=true`
- `AUTHZ_REQUIRE_WORKSPACE=true`

You must configure JWT values:
- `JWT_SECRET` or `JWT_PUBLIC_KEY`
- `JWT_ISSUER`
- `JWT_AUDIENCE`

## Local JWT Issuer Script

Generate a test token:

```bash
pnpm issue-jwt
```

Generate admin test token:

```bash
pnpm issue-jwt:admin
```

Custom example:

```bash
pnpm issue-jwt -- --sub joseph --org goldege --workspace prod --scopes "chat:write ai:infer execute:run billing:read"
```
