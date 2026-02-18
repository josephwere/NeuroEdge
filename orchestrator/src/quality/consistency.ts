import { listEvents } from "@storage/hybrid_db";

export interface ConsistencySnapshot {
  windowHours: number;
  sampledQueries: number;
  repeatedQueries: number;
  avgStability: number;
  lowStabilityQueries: Array<{ queryHash: string; attempts: number; uniqueResponses: number; stability: number }>;
}

export function buildConsistencySnapshot(windowHours = 72): ConsistencySnapshot {
  const cutoff = Date.now() - Math.max(1, windowHours) * 3600 * 1000;
  const events = listEvents(12000).filter(
    (e) => e.type === "ai.response" && Number(e.timestamp || 0) >= cutoff
  );
  const grouped = new Map<
    string,
    { attempts: number; responses: Set<string> }
  >();
  for (const evt of events) {
    const p = evt.payload || {};
    const qh = String(p.queryHash || "");
    const rh = String(p.responseHash || "");
    if (!qh || !rh) continue;
    if (!grouped.has(qh)) {
      grouped.set(qh, { attempts: 0, responses: new Set<string>() });
    }
    const g = grouped.get(qh)!;
    g.attempts += 1;
    g.responses.add(rh);
  }

  const repeated = Array.from(grouped.entries())
    .map(([queryHash, g]) => {
      const uniqueResponses = g.responses.size;
      const stability = g.attempts <= 1 ? 1 : 1 / uniqueResponses;
      return { queryHash, attempts: g.attempts, uniqueResponses, stability };
    })
    .filter((x) => x.attempts >= 2);

  const avgStability =
    repeated.length === 0
      ? 1
      : Number(
          (
            repeated.reduce((acc, x) => acc + x.stability, 0) / repeated.length
          ).toFixed(4)
        );

  return {
    windowHours,
    sampledQueries: grouped.size,
    repeatedQueries: repeated.length,
    avgStability,
    lowStabilityQueries: repeated
      .filter((x) => x.stability < 0.5)
      .sort((a, b) => a.stability - b.stability || b.attempts - a.attempts)
      .slice(0, 20),
  };
}
