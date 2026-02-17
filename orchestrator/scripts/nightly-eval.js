#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.ORCHESTRATOR_URL || "http://localhost:7070";
const API_KEY = process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || "";
const ORG = process.env.DEFAULT_ORG_ID || "personal";
const WORKSPACE = process.env.DEFAULT_WORKSPACE_ID || "default";

const tests = [
  { id: "math_1", query: "36 shared to 3 people, how many each?", expects: "12" },
  { id: "date_1", query: "what day today?", expects: "" },
  { id: "research_1", query: "latest edge ai trends with citations", expects: "Citation" },
  { id: "code_1", query: "give me a TypeScript function that sums array numbers", expects: "function" },
];

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "x-org-id": ORG,
    "x-workspace-id": WORKSPACE,
    Authorization: `Bearer ${API_KEY}`,
  };
}

async function runOne(t) {
  const resp = await fetch(`${BASE_URL}/ai`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ input: t.query, style: "balanced", context: [] }),
  });
  const json = await resp.json();
  const text = String(json?.response || "");
  const passed = !t.expects || text.toLowerCase().includes(t.expects.toLowerCase());
  return {
    id: t.id,
    query: t.query,
    passed,
    confidence: Number(json?.confidence || 0),
    intent: json?.intent || "",
    responsePreview: text.slice(0, 240),
  };
}

async function main() {
  const started = Date.now();
  const results = [];
  for (const t of tests) {
    try {
      const out = await runOne(t);
      results.push(out);
    } catch (err) {
      results.push({
        id: t.id,
        query: t.query,
        passed: false,
        confidence: 0,
        intent: "",
        responsePreview: String(err),
      });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const report = {
    ts: new Date().toISOString(),
    baseUrl: BASE_URL,
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs: Date.now() - started,
    results,
  };

  const outDir = path.join(process.cwd(), "data", "evals");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `nightly-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  console.log(`Nightly eval complete: ${passed}/${results.length} passed`);
  console.log(`Saved: ${outFile}`);
}

main().catch((err) => {
  console.error("Nightly eval failed:", err);
  process.exit(1);
});

