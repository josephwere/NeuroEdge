import { listEvents } from "@storage/hybrid_db";

export interface RetrievalFreshnessSummary {
  windowHours: number;
  researchRuns: number;
  avgPagesFetched: number;
  citationCount: number;
  staleCitationRate: number;
  topStaleDomains: Array<{ domain: string; staleCount: number }>;
  lastBootstrapRuns: Array<{ domain: string; timestamp: number; changedSources: number; staleByAge: boolean }>;
}

export function buildRetrievalFreshnessSummary(windowHours = 72): RetrievalFreshnessSummary {
  const cutoff = Date.now() - Math.max(1, windowHours) * 3600 * 1000;
  const events = listEvents(9000).filter((e) => Number(e.timestamp || 0) >= cutoff);

  const researchRuns = events.filter((e) => e.type === "research.run");
  const pages = researchRuns.map((e) => Number((e.payload || {}).pagesFetched || 0)).filter((n) => n > 0);
  const avgPagesFetched = pages.length === 0 ? 0 : Number((pages.reduce((a, b) => a + b, 0) / pages.length).toFixed(2));

  let citationCount = 0;
  let staleCitationCount = 0;
  const staleDomainMap = new Map<string, number>();
  for (const evt of researchRuns) {
    const citations = Array.isArray((evt.payload || {}).citations) ? (evt.payload || {}).citations : [];
    citationCount += citations.length;
    for (const c of citations) {
      const stale = Boolean(c?.stale);
      if (stale) {
        staleCitationCount += 1;
        const domain = String(c?.domain || "unknown").toLowerCase();
        staleDomainMap.set(domain, (staleDomainMap.get(domain) || 0) + 1);
      }
    }
  }

  const lastBootstrapRuns = events
    .filter((e) => e.type === "training.bootstrap_pack.run")
    .slice(-12)
    .map((e) => ({
      domain: String((e.payload || {}).domain || "general"),
      timestamp: Number(e.timestamp || 0),
      changedSources: Number((e.payload || {}).changedSources || 0),
      staleByAge: Boolean((e.payload || {}).staleByAge || false),
    }));

  return {
    windowHours,
    researchRuns: researchRuns.length,
    avgPagesFetched,
    citationCount,
    staleCitationRate:
      citationCount === 0 ? 0 : Number((staleCitationCount / citationCount).toFixed(4)),
    topStaleDomains: Array.from(staleDomainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, staleCount]) => ({ domain, staleCount })),
    lastBootstrapRuns,
  };
}
