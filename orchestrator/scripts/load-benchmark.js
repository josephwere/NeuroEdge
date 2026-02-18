#!/usr/bin/env node

const BASE_URL = process.env.ORCHESTRATOR_URL || "http://localhost:7070";
const API_KEY = process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || "";
const ORG = process.env.DEFAULT_ORG_ID || "personal";
const WORKSPACE = process.env.DEFAULT_WORKSPACE_ID || "default";
const CONCURRENCY = Math.max(1, Number(process.env.LOAD_CONCURRENCY || 25));
const REQUESTS = Math.max(1, Number(process.env.LOAD_REQUESTS || 300));

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "x-org-id": ORG,
    "x-workspace-id": WORKSPACE,
    Authorization: `Bearer ${API_KEY}`,
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function one(i) {
  const started = Date.now();
  const query = i % 5 === 0
    ? "What are latest edge AI trends with citations?"
    : i % 3 === 0
      ? "36 shared to 3 people, how many each?"
      : "Write a TypeScript function to sum numbers.";
  try {
    const resp = await fetch(`${BASE_URL}/ai`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ input: query, style: "balanced", context: [] }),
    });
    const json = await resp.json().catch(() => ({}));
    return {
      ok: resp.ok,
      status: resp.status,
      ms: Date.now() - started,
      confidence: Number(json?.confidence || 0),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      confidence: 0,
      error: String(err),
    };
  }
}

async function main() {
  if (!API_KEY) {
    console.error("Missing NEUROEDGE_API_KEY/KERNEL_API_KEY");
    process.exit(1);
  }
  const started = Date.now();
  const pending = [];
  const results = [];
  for (let i = 0; i < REQUESTS; i++) {
    pending.push(one(i));
    if (pending.length >= CONCURRENCY) {
      const batch = await Promise.all(pending.splice(0, pending.length));
      results.push(...batch);
    }
  }
  if (pending.length) {
    const batch = await Promise.all(pending);
    results.push(...batch);
  }
  const ok = results.filter((r) => r.ok).length;
  const lat = results.map((r) => r.ms).filter((n) => n > 0);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const qps = Number((REQUESTS / Math.max(1, (Date.now() - started) / 1000)).toFixed(2));
  const report = {
    baseUrl: BASE_URL,
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    success: ok,
    failed: REQUESTS - ok,
    successRate: Number((ok / REQUESTS).toFixed(4)),
    p50Ms: percentile(lat, 50),
    p95Ms: percentile(lat, 95),
    avgMs: Number(avg.toFixed(2)),
    qps,
    durationMs: Date.now() - started,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
