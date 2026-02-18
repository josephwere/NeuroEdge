import { AiResponse, AppConfig, ChatMessage, MobileRemoteConfig, MobileVersionInfo } from "./types";
import { Platform } from "react-native";

export function buildHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Org-Id": config.orgId,
    "X-Workspace-Id": config.workspaceId,
    "X-User-Role": config.userRole,
    "X-User-Plan": config.userPlan,
    "X-User-Email": config.userEmail,
    "X-User-Name": config.userName,
  };
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  if (config.bearerToken) headers.Authorization = `Bearer ${config.bearerToken}`;
  return headers;
}

export async function postJson<T>(url: string, body: Record<string, unknown>, config: AppConfig): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(parsed?.error || parsed?.detail || `HTTP ${resp.status}`);
  }
  return parsed as T;
}

export async function getJson<T>(url: string, config: AppConfig): Promise<T> {
  const resp = await fetch(url, { headers: buildHeaders(config) });
  const text = await resp.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(parsed?.error || parsed?.detail || `HTTP ${resp.status}`);
  }
  return parsed as T;
}

export async function health(config: AppConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const base = config.orchestratorUrl.replace(/\/$/, "");
    const resp = await fetch(`${base}/health`, { headers: buildHeaders(config) });
    if (!resp.ok) return { ok: false, detail: `HTTP ${resp.status}` };
    const data = await resp.json();
    return { ok: true, detail: String(data?.status || "ok") };
  } catch (err: any) {
    return { ok: false, detail: err?.message || "unreachable" };
  }
}

export async function checkMobileVersion(config: AppConfig): Promise<MobileVersionInfo | null> {
  try {
    const base = config.orchestratorUrl.replace(/\/$/, "");
    const platformClient = Platform.OS === "ios" ? "ios" : "android";
    const resp = await fetch(`${base}/app/version?client=${platformClient}`, { headers: buildHeaders(config) });
    if (!resp.ok) return null;
    return (await resp.json()) as MobileVersionInfo;
  } catch {
    return null;
  }
}

export async function fetchDashboardSummary(config: AppConfig): Promise<Record<string, unknown> | null> {
  try {
    const base = config.orchestratorUrl.replace(/\/$/, "");
    const resp = await fetch(`${base}/admin/dashboard/bootstrap`, { headers: buildHeaders(config) });
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchRemoteConfig(config: AppConfig): Promise<MobileRemoteConfig | null> {
  try {
    const base = config.orchestratorUrl.replace(/\/$/, "");
    const platformClient = Platform.OS === "ios" ? "ios" : "android";
    return await getJson<MobileRemoteConfig>(`${base}/app/config?client=${platformClient}`, config);
  } catch {
    return null;
  }
}

export async function fetchFounderAdminParity(config: AppConfig): Promise<Record<string, unknown>> {
  const base = config.orchestratorUrl.replace(/\/$/, "");
  const [
    bootstrap,
    access,
    deviceProtection,
    aegis,
    metrics,
    version,
    meshNodes,
    agents,
    twinReport,
    neurotwinProfile,
    extensions,
    idverse,
  ] = await Promise.allSettled([
    getJson(`${base}/admin/dashboard/bootstrap`, config),
    getJson(`${base}/admin/dashboard/access/bootstrap`, config),
    getJson(`${base}/admin/device-protection/bootstrap`, config),
    getJson(`${base}/admin/aegis/status`, config),
    getJson(`${base}/admin/system/metrics`, config),
    getJson(`${base}/admin/version`, config),
    getJson(`${base}/mesh/nodes`, config),
    getJson(`${base}/admin/agents`, config),
    getJson(`${base}/twin/report`, config),
    getJson(`${base}/neurotwin/profile`, config),
    getJson(`${base}/admin/dashboard/extensions`, config),
    getJson(`${base}/admin/dashboard/idverse`, config),
  ]);

  const pick = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason?.message || r.reason || "request_failed") };

  return {
    bootstrap: pick(bootstrap),
    access: pick(access),
    deviceProtection: pick(deviceProtection),
    aegis: pick(aegis),
    metrics: pick(metrics),
    version: pick(version),
    meshNodes: pick(meshNodes),
    agents: pick(agents),
    twinReport: pick(twinReport),
    neurotwinProfile: pick(neurotwinProfile),
    extensions: pick(extensions),
    idverse: pick(idverse),
  };
}

export async function askAssistant(
  input: string,
  threadMessages: ChatMessage[],
  config: AppConfig
): Promise<AiResponse> {
  const base = config.orchestratorUrl.replace(/\/$/, "");
  const context = threadMessages.slice(-8).map((m) => ({ role: m.role, content: m.text }));

  try {
    const ai = await postJson<AiResponse>(`${base}/ai`, { input, context, style: config.style }, config);
    if (ai?.response && ai.response.trim()) return ai;
  } catch {
    // fallback below
  }

  const fallback = await postJson<any>(
    `${base}/chat`,
    { kernelId: config.kernelId || "local", message: input, user: config.userEmail || "mobile" },
    config
  );
  const fallbackText =
    String(fallback?.response || "") ||
    String(fallback?.stdout || "") ||
    String(fallback?.output || "") ||
    "Request accepted.";
  return { success: true, response: fallbackText };
}
