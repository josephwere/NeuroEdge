import axios, { Method } from "axios";

export interface IdverseConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  projectId: string;
  timeoutMs: number;
  strictBiometric: boolean;
  strictLiveness: boolean;
}

function buildHeaders(cfg: IdverseConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
    headers["X-API-Key"] = cfg.apiKey;
  }
  if (cfg.projectId) {
    headers["X-Project-Id"] = cfg.projectId;
  }
  return headers;
}

export function maskApiKey(apiKey: string): string {
  const value = String(apiKey || "");
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function callIdverseWithFallback(
  cfg: IdverseConfig,
  method: Method,
  candidates: string[],
  payload?: Record<string, any>,
  query?: Record<string, any>
): Promise<{ data: any; endpoint: string }> {
  if (!cfg.enabled) {
    throw new Error("IDVerse integration disabled");
  }
  if (!cfg.baseUrl) {
    throw new Error("IDVerse base URL not configured");
  }

  const headers = buildHeaders(cfg);
  const timeout = Math.max(1000, Number(cfg.timeoutMs || 12000));
  let lastError = "IDVerse request failed";

  for (const candidate of candidates) {
    const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/${candidate.replace(/^\//, "")}`;
    try {
      const resp = await axios.request({
        url: endpoint,
        method,
        headers,
        timeout,
        data: payload || undefined,
        params: query || undefined,
      });
      return { data: resp.data, endpoint };
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      lastError = err?.response?.data?.error || err?.message || String(err);
      if (status === 404 || status === 405) {
        continue;
      }
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

