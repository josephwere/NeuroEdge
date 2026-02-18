export interface Citation {
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
  qualityScore?: number;
  stale?: boolean;
}

export interface ResearchResult {
  query: string;
  summary: string;
  citations: Citation[];
  pagesFetched: number;
}

interface SearchCandidate {
  title: string;
  url: string;
}

const researchCache = new Map<string, { ts: number; value: ResearchResult }>();

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeUrl(u: string): string | null {
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAllowedDomain(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowlist.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

function scoreSentence(sentence: string, terms: string[]): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (lower.includes(term)) score += 2;
  }
  score += Math.min(3, Math.floor(sentence.length / 120));
  return score;
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NeuroEdgeResearchBot/1.0 (+https://github.com/josephwere/NeuroEdge)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return stripHtml(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function qualityScoreForDomain(domain?: string): number {
  const d = String(domain || "").toLowerCase();
  if (!d) return 0.45;
  if (d.endsWith(".gov") || d.endsWith(".edu")) return 0.95;
  const trusted = ["wikipedia.org", "reuters.com", "bbc.com", "arxiv.org", "developer.mozilla.org", "stackoverflow.com"];
  if (trusted.some((t) => d === t || d.endsWith(`.${t}`))) return 0.86;
  return 0.6;
}

function staleByYearHeuristic(text: string): boolean {
  const nowYear = new Date().getFullYear();
  const years = Array.from(text.matchAll(/\b(19|20)\d{2}\b/g)).map((m) => Number(m[0]));
  if (years.length === 0) return false;
  const newest = Math.max(...years);
  return nowYear - newest >= 3;
}

async function searchDuckDuckGo(query: string, maxResults: number, timeoutMs: number): Promise<SearchCandidate[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NeuroEdgeResearchBot/1.0" },
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const results: SearchCandidate[] = [];
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && results.length < maxResults * 2) {
      let href = m[1] || "";
      const title = stripHtml(m[2] || "").trim();
      try {
        if (href.includes("duckduckgo.com/l/?")) {
          const u = new URL(href, "https://duckduckgo.com");
          href = u.searchParams.get("uddg") || href;
        }
      } catch {
        // no-op
      }
      const normalized = normalizeUrl(href);
      if (!normalized || !title) continue;
      results.push({ title, url: normalized });
    }
    return results.slice(0, maxResults);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSerpApi(query: string, maxResults: number, timeoutMs: number): Promise<SearchCandidate[]> {
  const key = process.env.SERPAPI_API_KEY || "";
  if (!key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(key)}`;
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
    return organic
      .map((r: any) => ({
        title: String(r?.title || "").trim(),
        url: normalizeUrl(String(r?.link || "")) || "",
      }))
      .filter((r: SearchCandidate) => !!r.title && !!r.url)
      .slice(0, maxResults);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function runResearch(query: string): Promise<ResearchResult> {
  const cacheTtlMs = Math.max(1000, Number(process.env.RESEARCH_CACHE_TTL_MS || 300000));
  const cacheKey = query.trim().toLowerCase();
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cacheTtlMs) {
    return cached.value;
  }

  const allowlist = parseList(process.env.RESEARCH_ALLOWLIST);
  const timeoutMs = Number(process.env.RESEARCH_HTTP_TIMEOUT_MS || 7000);
  const maxResults = Math.min(10, Math.max(1, Number(process.env.RESEARCH_MAX_RESULTS || 5)));
  const maxPages = Math.min(8, Math.max(1, Number(process.env.RESEARCH_MAX_PAGES || 3)));
  const minQuality = Math.max(0, Math.min(1, Number(process.env.RESEARCH_MIN_QUALITY_SCORE || 0.5)));
  const allowStale = String(process.env.RESEARCH_ALLOW_STALE || "false").toLowerCase() === "true";

  const serp = await searchSerpApi(query, maxResults, timeoutMs);
  const ddg = serp.length > 0 ? [] : await searchDuckDuckGo(query, maxResults, timeoutMs);
  const combined = [...serp, ...ddg];

  const uniqueByUrl = new Map<string, SearchCandidate>();
  for (const item of combined) {
    if (!uniqueByUrl.has(item.url)) uniqueByUrl.set(item.url, item);
  }

  const selected = Array.from(uniqueByUrl.values())
    .filter((r) => isAllowedDomain(r.url, allowlist))
    .slice(0, maxPages);

  const pages = await Promise.all(
    selected.map(async (entry) => {
      const text = await fetchText(entry.url, timeoutMs);
      return { ...entry, text };
    })
  );

  const queryTerms = query
    .toLowerCase()
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2)
    .slice(0, 8);

  const evidence: Array<{ sentence: string; source: number; score: number }> = [];
  const citations: Citation[] = [];

  pages.forEach((p, i) => {
    if (!p.text) return;
    const idx = i + 1;
    const domain = (() => {
      try {
        return new URL(p.url).hostname;
      } catch {
        return undefined;
      }
    })();
    const sentences = sentenceSplit(p.text);
    const top = sentences
      .map((s) => ({ sentence: s, source: idx, score: scoreSentence(s, queryTerms) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    evidence.push(...top);

    const snippet = top[0]?.sentence || p.text.slice(0, 220);
    const stale = staleByYearHeuristic(p.text);
    const qualityScore = qualityScoreForDomain(domain) - (stale ? 0.12 : 0);
    citations.push({
      title: p.title || p.url,
      url: p.url,
      domain,
      snippet,
      qualityScore,
      stale,
    });
  });

  evidence.sort((a, b) => b.score - a.score);
  const topEvidence = evidence.slice(0, 4);

  const filteredCitations = citations
    .filter((c) => Number(c.qualityScore || 0) >= minQuality)
    .filter((c) => allowStale || !c.stale);

  let summary = "";
  if (topEvidence.length === 0) {
    summary = "I could not gather enough reliable sources for this query with current allowlist and connectivity.";
  } else {
    const bullets = topEvidence.map((e) => `- ${e.sentence} [${e.source}]`).join("\n");
    const ranked = [...filteredCitations].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    summary = `## Research Summary\n\n${bullets}\n\n## Citations\n${ranked
      .map((c, i) => `${i + 1}. [${c.title}](${c.url})${c.stale ? " ⚠️ stale-signal" : ""}`)
      .join("\n")}`;
    if (ranked.length === 0) {
      summary += "\n\n⚠️ No citations met current quality/staleness policy.";
    }
  }

  const result = {
    query,
    summary,
    citations: filteredCitations,
    pagesFetched: pages.filter((p) => !!p.text).length,
  };
  researchCache.set(cacheKey, { ts: Date.now(), value: result });
  return result;
}
