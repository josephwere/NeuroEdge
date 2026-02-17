# NeuroEdge Research + Training Pipeline

## Endpoints

- `POST /research`
  - Scope: `research:run`
  - Body:
    - `query` (string)
  - Returns:
    - `summary` (markdown with citations)
    - `citations[]`
    - `pagesFetched`

- `POST /training/feedback`
  - Scope: `training:write`
  - Body:
    - `query`
    - `response`
    - `rating` (`up` | `down` | `neutral`)
    - optional `tags[]`, `citations[]`

- `GET /training/samples?limit=200`
  - Scope: `training:read`

- `GET /training/export?limit=5000`
  - Scope: `training:read`
  - Returns JSONL for fine-tuning datasets.

- `POST /ai/stream`
  - Scope: `ai:infer`
  - SSE stream of response tokens and final payload marker.

## Safety Controls

Configured in `.env`:

- `RESEARCH_ALLOWLIST`
- `RESEARCH_MAX_RESULTS`
- `RESEARCH_MAX_PAGES`
- `RESEARCH_HTTP_TIMEOUT_MS`
- `RESEARCH_RATE_LIMIT_WINDOW_MS`
- `RESEARCH_RATE_LIMIT_MAX`
- `TRAINING_RATE_LIMIT_WINDOW_MS`
- `TRAINING_RATE_LIMIT_MAX`

## Quick Test (API key auth)

```bash
API_KEY="your_api_key"

curl -s http://localhost:7070/research \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-org-id: personal" \
  -H "x-workspace-id: default" \
  -d '{"query":"latest developments in edge AI inference"}'
```

## Nightly Eval

Run benchmark batch:

```bash
pnpm eval:nightly
```

```bash
curl -s http://localhost:7070/training/feedback \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-org-id: personal" \
  -H "x-workspace-id: default" \
  -d '{"query":"what is edge AI","response":"...","rating":"up","tags":["research","qa"]}'
```
