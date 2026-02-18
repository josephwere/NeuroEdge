# NeuroEdge Training Start Guide

## 1) Preconditions

1. Orchestrator, Kernel, and ML services healthy.
2. Frontier readiness check is green or acceptable by founder override.
3. Baselines configured for eval regression gates.
4. Trusted bootstrap packs ingested and freshness monitored.

## 2) Verify readiness

```bash
curl -s http://localhost:7070/admin/frontier-program/readiness \
  -H "x-api-key: $NEUROEDGE_API_KEY" \
  -H "x-org-id: personal" \
  -H "x-workspace-id: default"
```

## 3) Run quality hardening before training

```bash
curl -s -X POST http://localhost:7070/admin/quality/hardening/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: $NEUROEDGE_API_KEY" \
  -H "x-org-id: personal" \
  -H "x-workspace-id: default" \
  -d '{}'
```

## 4) Run load benchmark

```bash
cd orchestrator
NEUROEDGE_API_KEY=$NEUROEDGE_API_KEY pnpm run load:benchmark
```

## 5) Start training jobs

Use dashboard Training Studio or API:

```bash
curl -s -X POST http://localhost:7070/admin/training/jobs/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: $NEUROEDGE_API_KEY" \
  -H "x-org-id: personal" \
  -H "x-workspace-id: default" \
  -d '{"mode":"incremental","evalSuite":"core","options":{"dedupe":true,"piiFilter":true}}'
```

## 6) Keep nightly quality loops active

- nightly eval
- red-team checks
- benchmark regression check
- retrieval freshness recrawl
- trust consistency reporting

Only promote model/router changes when baseline gates pass.
