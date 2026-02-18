import { listEvents } from "@storage/hybrid_db";

export interface ReliabilitySnapshot {
  windowHours: number;
  traces: number;
  successRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  toolFailureRate: number;
  topErrors: Array<{ reason: string; count: number }>;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function buildReliabilitySnapshot(windowHours = 24): ReliabilitySnapshot {
  const cutoff = Date.now() - Math.max(1, windowHours) * 3600 * 1000;
  const events = listEvents(6000).filter((evt) => Number(evt.timestamp || 0) >= cutoff);

  const traces = events.filter((evt) => evt.type === "trace.llm");
  const latency = traces
    .map((t) => Number((t.payload || {}).latencyMs || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const successCount = traces.filter((t) => Boolean((t.payload || {}).success)).length;
  const totalTraces = traces.length;
  const errorCount = Math.max(0, totalTraces - successCount);

  const toolEvents = events.filter(
    (evt) => evt.type === "ml.infer.response" || evt.type === "research.run"
  );
  const toolFailures = toolEvents.filter((evt) => Boolean((evt.payload || {}).error)).length;

  const errorMap = new Map<string, number>();
  for (const evt of events) {
    if (!/error|failed|blocked/i.test(String(evt.type || ""))) continue;
    const reason =
      String((evt.payload || {}).error || (evt.payload || {}).reason || evt.type || "unknown")
        .trim()
        .slice(0, 120) || "unknown";
    errorMap.set(reason, (errorMap.get(reason) || 0) + 1);
  }
  const topErrors = Array.from(errorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([reason, count]) => ({ reason, count }));

  return {
    windowHours,
    traces: totalTraces,
    successRate: totalTraces === 0 ? 0 : Number((successCount / totalTraces).toFixed(4)),
    errorRate: totalTraces === 0 ? 0 : Number((errorCount / totalTraces).toFixed(4)),
    p50LatencyMs: percentile(latency, 50),
    p95LatencyMs: percentile(latency, 95),
    toolFailureRate: toolEvents.length === 0 ? 0 : Number((toolFailures / toolEvents.length).toFixed(4)),
    topErrors,
  };
}
