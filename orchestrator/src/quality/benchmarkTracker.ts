import { listEvents, readState, writeState } from "@storage/hybrid_db";

export interface BenchmarkBaseline {
  suite: string;
  minAccuracy: number;
  maxP95LatencyMs: number;
}

export interface BenchmarkPoint {
  suite: string;
  accuracy: number;
  p95LatencyMs: number;
  timestamp: number;
}

function defaultBaselines(): BenchmarkBaseline[] {
  return [
    { suite: "core", minAccuracy: 0.82, maxP95LatencyMs: 2500 },
    { suite: "reasoning", minAccuracy: 0.78, maxP95LatencyMs: 3200 },
    { suite: "coding", minAccuracy: 0.8, maxP95LatencyMs: 3200 },
    { suite: "research", minAccuracy: 0.76, maxP95LatencyMs: 4500 },
  ];
}

export function getBenchmarkBaselines(): BenchmarkBaseline[] {
  const state = readState();
  const raw = (state.summary?.qualityBaselines || []) as any[];
  if (!Array.isArray(raw) || raw.length === 0) return defaultBaselines();
  return raw
    .map((r) => ({
      suite: String(r?.suite || "").toLowerCase(),
      minAccuracy: Math.max(0, Math.min(1, Number(r?.minAccuracy || 0))),
      maxP95LatencyMs: Math.max(100, Number(r?.maxP95LatencyMs || 1000)),
    }))
    .filter((b) => !!b.suite);
}

export function saveBenchmarkBaselines(next: BenchmarkBaseline[]) {
  const state = readState();
  const merged = next
    .map((r) => ({
      suite: String(r?.suite || "").toLowerCase(),
      minAccuracy: Math.max(0, Math.min(1, Number(r?.minAccuracy || 0))),
      maxP95LatencyMs: Math.max(100, Number(r?.maxP95LatencyMs || 1000)),
    }))
    .filter((b) => !!b.suite);
  writeState({
    ...state,
    summary: {
      ...(state.summary || {}),
      qualityBaselines: merged,
      updatedAt: Date.now(),
    },
  });
  return merged;
}

function extractPointsFromEvents(limit = 10000): BenchmarkPoint[] {
  const events = listEvents(limit).filter((e) =>
    ["quality.eval.completed", "quality.eval.batch.completed", "quality.eval.nightly.completed"].includes(
      e.type
    )
  );
  const points: BenchmarkPoint[] = [];
  for (const evt of events) {
    const payload = evt.payload || {};
    if (evt.type === "quality.eval.completed") {
      const report = payload.report || {};
      points.push({
        suite: String(report.suite || payload.suite || "core").toLowerCase(),
        accuracy: Number(report.accuracy || 0),
        p95LatencyMs: Number(report.p95LatencyMs || 0),
        timestamp: Number(evt.timestamp || Date.now()),
      });
      continue;
    }
    if (evt.type === "quality.eval.batch.completed") {
      const suites = payload?.report?.suites || {};
      Object.keys(suites).forEach((suite) => {
        const r = suites[suite] || {};
        points.push({
          suite: String(suite).toLowerCase(),
          accuracy: Number(r.accuracy || 0),
          p95LatencyMs: Number(r.p95LatencyMs || 0),
          timestamp: Number(evt.timestamp || Date.now()),
        });
      });
      continue;
    }
    if (evt.type === "quality.eval.nightly.completed") {
      const report = payload?.report || {};
      ["core", "reasoning", "coding", "research"].forEach((suite) => {
        const r = report?.[suite] || {};
        points.push({
          suite,
          accuracy: Number(r.accuracy || 0),
          p95LatencyMs: Number(r.p95LatencyMs || 0),
          timestamp: Number(evt.timestamp || Date.now()),
        });
      });
    }
  }
  return points.filter((p) => !!p.suite);
}

export function buildBenchmarkTrend(windowDays = 30) {
  const cutoff = Date.now() - Math.max(1, windowDays) * 24 * 3600 * 1000;
  const points = extractPointsFromEvents().filter((p) => p.timestamp >= cutoff);
  const bySuite: Record<string, BenchmarkPoint[]> = {};
  for (const p of points) {
    if (!bySuite[p.suite]) bySuite[p.suite] = [];
    bySuite[p.suite].push(p);
  }
  Object.values(bySuite).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  return { windowDays, totalPoints: points.length, bySuite };
}

export function computeBenchmarkRegression(windowDays = 30) {
  const trend = buildBenchmarkTrend(windowDays);
  const baselines = getBenchmarkBaselines();
  const latest = Object.entries(trend.bySuite).map(([suite, points]) => ({
    suite,
    point: points[points.length - 1],
  }));
  const checks = latest.map(({ suite, point }) => {
    const baseline = baselines.find((b) => b.suite === suite);
    if (!baseline) {
      return {
        suite,
        status: "unknown",
        reason: "missing_baseline",
        point,
        baseline: null,
      };
    }
    const accuracyOk = Number(point.accuracy || 0) >= baseline.minAccuracy;
    const latencyOk = Number(point.p95LatencyMs || 0) <= baseline.maxP95LatencyMs;
    return {
      suite,
      status: accuracyOk && latencyOk ? "pass" : "regression",
      reason: accuracyOk && latencyOk ? "meets_baseline" : !accuracyOk ? "accuracy_below_baseline" : "latency_above_baseline",
      point,
      baseline,
    };
  });
  return {
    windowDays,
    baselines,
    checks,
    regressions: checks.filter((c) => c.status === "regression").length,
  };
}
