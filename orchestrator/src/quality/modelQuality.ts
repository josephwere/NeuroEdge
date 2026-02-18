import crypto from "crypto";
import { appendEvent, listEvents, readState, writeState } from "@storage/hybrid_db";

export interface ModelVariantConfig {
  id: string;
  weight: number;
  domains: string[];
  enabled: boolean;
}

export interface ModelRouterConfig {
  updatedAt: number;
  variants: ModelVariantConfig[];
}

function parseVariantsFromEnv(): ModelVariantConfig[] {
  const raw = String(process.env.MODEL_VARIANTS || "").trim();
  if (!raw) {
    return [
      { id: String(process.env.LLM_MODEL_NAME || "neuroedge-7b-instruct"), weight: 100, domains: ["general"], enabled: true },
    ];
  }
  const entries = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const variants = entries.map((entry) => {
    const [id, weightRaw] = entry.split(":");
    const weight = Math.max(1, Number(weightRaw || 1));
    return { id: String(id || "").trim(), weight, domains: ["general"], enabled: true };
  });
  return variants.filter((v) => !!v.id);
}

export function getModelRouterConfig(): ModelRouterConfig {
  const state = readState();
  const cfg = ((state.summary || {}).modelRouter || {}) as Partial<ModelRouterConfig>;
  const variants = Array.isArray(cfg.variants) && cfg.variants.length > 0
    ? cfg.variants
        .map((v) => ({
          id: String(v.id || "").trim(),
          weight: Math.max(1, Number(v.weight || 1)),
          domains: Array.isArray(v.domains) ? v.domains.map((d) => String(d).toLowerCase()) : ["general"],
          enabled: Boolean(v.enabled ?? true),
        }))
        .filter((v) => !!v.id)
    : parseVariantsFromEnv();
  return { updatedAt: Number(cfg.updatedAt || Date.now()), variants };
}

export function saveModelRouterConfig(next: Partial<ModelRouterConfig>) {
  const state = readState();
  const current = getModelRouterConfig();
  const merged: ModelRouterConfig = {
    updatedAt: Date.now(),
    variants: Array.isArray(next.variants) && next.variants.length > 0 ? next.variants : current.variants,
  };
  writeState({
    ...state,
    summary: {
      ...(state.summary || {}),
      modelRouter: merged,
    },
  });
  appendEvent({
    type: "quality.model_router.updated",
    timestamp: Date.now(),
    payload: merged,
  });
  return merged;
}

function weightedPick(items: ModelVariantConfig[], seed: string): ModelVariantConfig {
  const enabled = items.filter((i) => i.enabled && i.weight > 0);
  if (enabled.length === 0) return items[0];
  const totalWeight = enabled.reduce((acc, i) => acc + i.weight, 0);
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  const n = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  const target = n * totalWeight;
  let cursor = 0;
  for (const item of enabled) {
    cursor += item.weight;
    if (target <= cursor) return item;
  }
  return enabled[enabled.length - 1];
}

export function chooseModelVariant(opts: { domain?: string; actor?: string; workspaceId?: string; text?: string }) {
  const cfg = getModelRouterConfig();
  const domain = String(opts.domain || "general").toLowerCase();
  const filtered = cfg.variants.filter((v) => v.domains.includes("general") || v.domains.includes(domain));
  const candidates = filtered.length > 0 ? filtered : cfg.variants;
  const dateBucket = new Date().toISOString().slice(0, 10);
  const seed = `${opts.actor || "anon"}::${opts.workspaceId || "default"}::${domain}::${dateBucket}::${String(opts.text || "").slice(0, 120)}`;
  const pick = weightedPick(candidates, seed);
  return { variant: pick.id, config: cfg };
}

export function recordModelOutcome(sample: {
  model: string;
  rating: "up" | "down" | "neutral";
  domain?: string;
  latencyMs?: number;
  confidence?: number;
}) {
  appendEvent({
    type: "quality.model.outcome",
    timestamp: Date.now(),
    payload: {
      model: sample.model,
      rating: sample.rating,
      domain: sample.domain || "general",
      latencyMs: Number(sample.latencyMs || 0),
      confidence: Number(sample.confidence || 0),
    },
  });
}

export function summarizeModelOutcomes(limit = 6000) {
  const events = listEvents(limit).filter((e) => e.type === "quality.model.outcome");
  const agg: Record<string, { total: number; up: number; down: number; neutral: number; avgLatencyMs: number; avgConfidence: number }> = {};
  for (const evt of events) {
    const p = evt.payload || {};
    const model = String(p.model || "unknown");
    if (!agg[model]) {
      agg[model] = { total: 0, up: 0, down: 0, neutral: 0, avgLatencyMs: 0, avgConfidence: 0 };
    }
    const a = agg[model];
    a.total += 1;
    const rating = String(p.rating || "neutral");
    if (rating === "up") a.up += 1;
    else if (rating === "down") a.down += 1;
    else a.neutral += 1;
    const latency = Number(p.latencyMs || 0);
    const conf = Number(p.confidence || 0);
    a.avgLatencyMs = a.avgLatencyMs + (latency - a.avgLatencyMs) / a.total;
    a.avgConfidence = a.avgConfidence + (conf - a.avgConfidence) / a.total;
  }
  return {
    totalEvents: events.length,
    models: Object.entries(agg).map(([model, v]) => ({
      model,
      ...v,
      avgLatencyMs: Number(v.avgLatencyMs.toFixed(2)),
      avgConfidence: Number(v.avgConfidence.toFixed(4)),
      upRate: v.total === 0 ? 0 : Number((v.up / v.total).toFixed(4)),
      downRate: v.total === 0 ? 0 : Number((v.down / v.total).toFixed(4)),
    })),
  };
}
