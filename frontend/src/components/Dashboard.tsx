import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { chatContext } from "@/services/chatContext";
import { listConversations } from "@/services/conversationStore";

type DashboardView =
  | "founder"
  | "admin"
  | "developer"
  | "ai_agent"
  | "user"
  | "enterprise";

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "degraded";
  detail: string;
}

interface KernelSnapshot {
  name: string;
  status: string;
  version: string;
}

interface AdminVersion {
  orchestratorVersion?: string;
  stateVersion?: string;
  doctrineVersion?: number;
}

interface UsageSummary {
  totals?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  byProvider?: Record<string, unknown>;
  byModel?: Record<string, unknown>;
}

interface AdminSystemMetrics {
  uptimeSec?: number;
  memory?: {
    rss?: number;
    heapTotal?: number;
    heapUsed?: number;
    external?: number;
  };
}

const Dashboard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [view, setView] = useState<DashboardView>("founder");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [kernels, setKernels] = useState<KernelSnapshot[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({});
  const [billingSummary, setBillingSummary] = useState<UsageSummary>({});
  const [adminVersion, setAdminVersion] = useState<AdminVersion>({});
  const [adminMetrics, setAdminMetrics] = useState<AdminSystemMetrics>({});
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const [adminAgents, setAdminAgents] = useState<any[]>([]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("neuroedge_feature_flags_v1") || "{}");
    } catch {
      return {};
    }
  });
  const [modelControl, setModelControl] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("neuroedge_model_control_v1") || "{}");
    } catch {
      return {};
    }
  });
  const [webhookUrl, setWebhookUrl] = useState("");
  const [developerEnv, setDeveloperEnv] = useState<"dev" | "staging" | "prod">("dev");
  const [users, setUsers] = useState([
    { id: "u1", name: "Guest User", role: "user", status: "active" },
    { id: "u2", name: "Analyst Team", role: "moderator", status: "active" },
    { id: "u3", name: "Node-Operator", role: "user", status: "pending" },
  ]);
  const [agents, setAgents] = useState([
    { id: "a1", name: "Research Copilot", memory: "enabled", tools: "web,research", permission: "workspace" },
    { id: "a2", name: "Code Assistant", memory: "enabled", tools: "code,logs", permission: "project" },
  ]);
  const [enterpriseTeams, setEnterpriseTeams] = useState([
    { dept: "Engineering", users: 12, monthlyTokens: 190000 },
    { dept: "Support", users: 7, monthlyTokens: 48000 },
    { dept: "Research", users: 5, monthlyTokens: 99000 },
  ]);

  const resolveAuthContext = () => {
    const envToken = String((import.meta.env.VITE_NEUROEDGE_JWT as string) || "").trim();
    const envApiKey = String((import.meta.env.VITE_NEUROEDGE_API_KEY as string) || "").trim();
    const envOrg = String((import.meta.env.VITE_DEFAULT_ORG_ID as string) || "").trim();
    const envWorkspace = String((import.meta.env.VITE_DEFAULT_WORKSPACE_ID as string) || "").trim();
    let userToken = "";
    let sessionToken = "";
    let orgId = "";
    let workspaceId = "";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        orgId = String(parsed?.orgId || "");
        workspaceId = String(parsed?.workspaceId || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        orgId = orgId || String(parsed?.orgId || "");
        workspaceId = workspaceId || String(parsed?.workspaceId || "");
      }
    } catch {
      // ignore malformed storage
    }
    return {
      token: envToken || userToken || sessionToken,
      apiKey: envApiKey,
      orgId: orgId || envOrg || "personal",
      workspaceId: workspaceId || envWorkspace || "default",
    };
  };

  const apiBase = String(import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:7070");
  const withHeaders = () => {
    const auth = resolveAuthContext();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-org-id": auth.orgId,
      "x-workspace-id": auth.workspaceId,
    };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    if (auth.apiKey) headers["x-api-key"] = auth.apiKey;
    return headers;
  };

  const getJson = async (path: string) => {
    const res = await fetch(`${apiBase}${path}`, { headers: withHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const postJson = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: withHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const localMessageStats = useMemo(() => {
    const all = chatContext.getAll();
    const total = all.length;
    const errors = all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("❌")).length;
    const warnings = all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("⚠️")).length;
    return { total, errors, warnings };
  }, []);

  const userDashboardStats = useMemo(() => {
    const conversations = listConversations();
    const totalChats = conversations.length;
    const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);
    return {
      totalChats,
      totalMessages,
      latestChat: conversations[0]?.title || "No chats yet",
    };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const nextServices: ServiceStatus[] = [];
      try {
        const health = await getJson("/health");
        nextServices.push({
          name: "Orchestrator",
          status: health?.status === "ok" ? "online" : "degraded",
          detail: health?.status === "ok" ? "Serving API" : "Health degraded",
        });
      } catch {
        nextServices.push({ name: "Orchestrator", status: "offline", detail: "Not reachable" });
      }

      try {
        const sys = await getJson("/system/status");
        if (Array.isArray(sys?.services)) {
          sys.services.forEach((s: ServiceStatus) => nextServices.push(s));
        }
      } catch {
        // ignore
      }
      setServices(nextServices);

      try {
        const data = await getJson("/kernels");
        const snapshot: KernelSnapshot[] = Object.entries(data || {}).map(([name, info]: [string, any]) => ({
          name,
          status: info?.status || "unknown",
          version: info?.version || "unknown",
        }));
        setKernels(snapshot);
      } catch {
        setKernels([]);
      }

      const adminCalls = await Promise.allSettled([
        getJson("/admin/usage"),
        getJson("/billing/usage"),
        getJson("/admin/version"),
        getJson("/admin/system/metrics"),
        getJson("/admin/logs?limit=200"),
        getJson("/admin/audit?limit=200"),
        getJson("/admin/agents"),
      ]);

      if (adminCalls[0].status === "fulfilled") setUsageSummary(adminCalls[0].value?.usage || {});
      if (adminCalls[1].status === "fulfilled") setBillingSummary(adminCalls[1].value?.summary || {});
      if (adminCalls[2].status === "fulfilled") setAdminVersion(adminCalls[2].value || {});
      if (adminCalls[3].status === "fulfilled") setAdminMetrics(adminCalls[3].value || {});
      if (adminCalls[4].status === "fulfilled") setAdminLogs(adminCalls[4].value?.logs || []);
      if (adminCalls[5].status === "fulfilled") setAdminAudit(adminCalls[5].value?.audit || []);
      if (adminCalls[6].status === "fulfilled") setAdminAgents(adminCalls[6].value?.agents || []);
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  const securityAlerts = useMemo(
    () => adminAudit.filter((a) => String(a?.type || "").startsWith("doctrine.") || String(a?.type || "").startsWith("policy.")),
    [adminAudit]
  );

  const tokenTotal = Number(usageSummary?.totals?.totalTokens || billingSummary?.totals?.totalTokens || 0);
  const reqTotal = Number(usageSummary?.totals?.requests || billingSummary?.totals?.requests || 0);
  const revenueEstimate = Number(((tokenTotal / 1000000) * 8.5).toFixed(2));

  const renderFounder = () => (
    <div style={grid2}>
      <Card title="Platform Analytics">
        <Stat label="Users (workspace)" value={String(users.length)} />
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Token Usage" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Subscription & Payments">
        <Stat label="Estimated Revenue" value={`$${revenueEstimate}`} />
        <Stat label="Billing Events" value={String(adminLogs.filter((e) => e.type === "billing.usage").length)} />
      </Card>
      <Card title="API Usage & Tokens">
        <Stat label="Input Tokens" value={String(usageSummary?.totals?.inputTokens || 0)} />
        <Stat label="Output Tokens" value={String(usageSummary?.totals?.outputTokens || 0)} />
      </Card>
      <Card title="AI Agent Performance">
        <Stat label="Active Agents" value={String(adminAgents.length || agents.length)} />
        <Stat label="AI Events" value={String(adminLogs.filter((e) => String(e.type).includes("ml.")).length)} />
      </Card>
      <Card title="System Health">
        <Stat label="Uptime (sec)" value={String(adminMetrics?.uptimeSec || 0)} />
        <Stat label="Kernel Nodes" value={String(kernels.length)} />
        <Stat label="Heap Used" value={formatBytes(adminMetrics?.memory?.heapUsed || 0)} />
      </Card>
      <Card title="User Management">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chipBtn} onClick={() => updateUser(u.id, { status: "banned" })}>Ban</button>
              <button style={chipBtn} onClick={() => updateUser(u.id, { role: "admin" })}>Promote</button>
              <button style={chipBtn} onClick={() => updateUser(u.id, { status: "verified" })}>Verify</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Model Control">
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Model
            <select
              value={String(modelControl.model || "neuroedge-7b-instruct")}
              onChange={(e) => setModelSetting("model", e.target.value)}
              style={input}
            >
              <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
              <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
              <option value="neuroedge-70b-router">neuroedge-70b-router</option>
            </select>
          </label>
          <label>
            Temperature
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={String(modelControl.temperature ?? "0.3")}
              onChange={(e) => setModelSetting("temperature", Number(e.target.value))}
              style={input}
            />
          </label>
        </div>
      </Card>
      <Card title="Feature Flags">
        {[
          "research_pipeline",
          "streaming_tokens",
          "mesh_inference",
          "strict_citations",
          "founder_mode",
        ].map((f) => (
          <div key={f} style={row}>
            <span>{f}</span>
            <button style={chipBtn} onClick={() => toggleFlag(f)}>
              {featureFlags[f] ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </Card>
      <Card title="Security Alerts">
        {securityAlerts.length === 0 ? <p style={muted}>No active alerts.</p> : securityAlerts.slice(0, 6).map((a, idx) => (
          <div key={`${a.type}-${idx}`} style={alertRow}>
            <strong>{a.type}</strong>
            <span style={muted}>{new Date(a.timestamp).toLocaleString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );

  const renderAdmin = () => (
    <div style={grid2}>
      <Card title="User Moderation">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name} ({u.status})</span>
            <button style={chipBtn} onClick={() => updateUser(u.id, { status: u.status === "active" ? "review" : "active" })}>
              {u.status === "active" ? "Flag" : "Restore"}
            </button>
          </div>
        ))}
      </Card>
      <Card title="Content Review">
        <p style={muted}>Recent AI/content events from logs.</p>
        {adminLogs.slice(0, 8).map((l, i) => (
          <div key={i} style={logRow}>{l.type}</div>
        ))}
      </Card>
      <Card title="Support Tickets">
        <div style={logRow}>#NE-1001 Login issue - open</div>
        <div style={logRow}>#NE-1002 Billing inquiry - pending</div>
        <div style={logRow}>#NE-1003 Agent timeout - triaged</div>
      </Card>
      <Card title="Logs & Activity Tracking">
        <Stat label="Log Events" value={String(adminLogs.length)} />
        <Stat label="Audit Events" value={String(adminAudit.length)} />
      </Card>
      <Card title="AI Response Monitoring">
        <Stat label="AI Events" value={String(adminLogs.filter((e) => String(e.type).includes("ml.")).length)} />
        <Stat label="Policy Blocks" value={String(adminAudit.filter((e) => String(e.type).includes("policy.blocked")).length)} />
      </Card>
      <Card title="Report Management">
        <button style={primaryBtn} onClick={downloadAudit}>Export Audit JSON</button>
      </Card>
    </div>
  );

  const renderDeveloper = () => (
    <div style={grid2}>
      <Card title="API Key Management">
        <Stat label="Current Key" value={maskKey(String(import.meta.env.VITE_NEUROEDGE_API_KEY || ""))} />
        <button style={chipBtn} onClick={() => addNotification({ type: "info", message: "Rotate key from server secrets manager." })}>
          Rotate Guidance
        </button>
      </Card>
      <Card title="Usage Tracking">
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Total Tokens" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Webhook Setup">
        <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" style={input} />
        <button style={chipBtn} onClick={() => addNotification({ type: "success", message: `Webhook saved: ${webhookUrl || "(empty)"}` })}>Save Webhook</button>
      </Card>
      <Card title="Model Selection">
        <select value={String(modelControl.model || "neuroedge-7b-instruct")} onChange={(e) => setModelSetting("model", e.target.value)} style={input}>
          <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
          <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
          <option value="neuroedge-70b-router">neuroedge-70b-router</option>
        </select>
      </Card>
      <Card title="Environment Settings">
        <select value={developerEnv} onChange={(e) => setDeveloperEnv(e.target.value as any)} style={input}>
          <option value="dev">dev</option>
          <option value="staging">staging</option>
          <option value="prod">prod</option>
        </select>
      </Card>
      <Card title="Debugging Tools">
        <button style={chipBtn} onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "history" }))}>
          Open Logs / History
        </button>
      </Card>
    </div>
  );

  const renderAIAgent = () => (
    <div style={grid2}>
      <Card title="Create / Edit Agents">
        <button
          style={primaryBtn}
          onClick={() =>
            setAgents((prev) => [
              ...prev,
              { id: `a${Date.now()}`, name: `New Agent ${prev.length + 1}`, memory: "enabled", tools: "chat", permission: "workspace" },
            ])
          }
        >
          + New Agent
        </button>
        {agents.map((a) => (
          <div key={a.id} style={row}>
            <span>{a.name}</span>
            <button style={chipBtn} onClick={() => addNotification({ type: "info", message: `Edit ${a.name} from dedicated editor (next phase).` })}>
              Edit
            </button>
          </div>
        ))}
      </Card>
      <Card title="Knowledge Base Upload">
        <input
          type="file"
          onChange={(e) => verifyUploadType(e.target.files?.[0])}
          style={{ color: "var(--ne-fg)" }}
        />
      </Card>
      <Card title="Prompt Engineering">
        <textarea defaultValue="System prompt template..." style={{ ...input, minHeight: 120 }} />
      </Card>
      <Card title="Tool Integrations">
        {["research", "code", "math", "files"].map((t) => (
          <div key={t} style={row}>
            <span>{t}</span>
            <button style={chipBtn} onClick={() => addNotification({ type: "success", message: `${t} integration active` })}>Active</button>
          </div>
        ))}
      </Card>
      <Card title="Agent Analytics">
        <Stat label="Agents" value={String(agents.length)} />
        <Stat label="Usage Events" value={String(adminLogs.filter((e) => String(e.type).includes("agent")).length)} />
      </Card>
      <Card title="Memory & Permissions">
        {agents.map((a) => (
          <div key={a.id} style={logRow}>
            {a.name} • memory={a.memory} • permission={a.permission}
          </div>
        ))}
      </Card>
    </div>
  );

  const renderUser = () => (
    <div style={grid2}>
      <Card title="Chat History">
        <Stat label="Chats" value={String(userDashboardStats.totalChats)} />
        <Stat label="Messages" value={String(userDashboardStats.totalMessages)} />
        <Stat label="Latest" value={userDashboardStats.latestChat} />
      </Card>
      <Card title="Saved Prompts">
        <div style={logRow}>/research latest AI regulation updates</div>
        <div style={logRow}>Summarize this code and suggest optimizations</div>
      </Card>
      <Card title="File Uploads">
        <input type="file" style={{ color: "var(--ne-fg)" }} />
      </Card>
      <Card title="Subscription Plan">
        <Stat label="Plan" value="Founder Local" />
        <Stat label="Estimated Spend" value={`$${revenueEstimate}`} />
      </Card>
      <Card title="Usage Stats">
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Tokens" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Settings & Notifications">
        <button style={chipBtn} onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "settings" }))}>Open Settings</button>
      </Card>
    </div>
  );

  const renderEnterprise = () => (
    <div style={grid2}>
      <Card title="Team Roles">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name}</span>
            <select
              value={u.role}
              onChange={(e) => updateUser(u.id, { role: e.target.value })}
              style={{ ...input, width: 130 }}
            >
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
          </div>
        ))}
      </Card>
      <Card title="Usage per Department">
        {enterpriseTeams.map((d) => (
          <div key={d.dept} style={logRow}>
            {d.dept}: {d.monthlyTokens.toLocaleString()} tokens / {d.users} users
          </div>
        ))}
      </Card>
      <Card title="Billing Control">
        <Stat label="Org Requests" value={String(reqTotal)} />
        <Stat label="Org Tokens" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Audit Logs">
        <Stat label="Audit Events" value={String(adminAudit.length)} />
        <button style={chipBtn} onClick={downloadAudit}>Export Compliance JSON</button>
      </Card>
      <Card title="Compliance Exports">
        <button style={chipBtn} onClick={downloadAudit}>Export SOC-ready log bundle</button>
      </Card>
      <Card title="SSO Configuration">
        <div style={logRow}>SSO mode: local stub (enable enterprise IdP in production gateway)</div>
      </Card>
    </div>
  );

  function updateUser(id: string, patch: Partial<{ role: string; status: string }>) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    addNotification({ type: "success", message: `Updated user ${id}` });
  }

  function setModelSetting(key: string, value: unknown) {
    setModelControl((prev: any) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("neuroedge_model_control_v1", JSON.stringify(next));
      return next;
    });
    addNotification({ type: "success", message: "Model control updated" });
  }

  function toggleFlag(flag: string) {
    setFeatureFlags((prev) => {
      const next = { ...prev, [flag]: !prev[flag] };
      localStorage.setItem("neuroedge_feature_flags_v1", JSON.stringify(next));
      addNotification({ type: "info", message: `Feature ${flag}: ${next[flag] ? "enabled" : "disabled"}` });
      return next;
    });
  }

  function verifyUploadType(file?: File) {
    if (!file) return;
    const allowed = [".txt", ".md", ".pdf", ".json", ".csv", ".docx"];
    const lower = file.name.toLowerCase();
    const ok = allowed.some((ext) => lower.endsWith(ext));
    addNotification({
      type: ok ? "success" : "error",
      message: ok ? `Accepted: ${file.name}` : `Rejected file type: ${file.name}`,
    });
  }

  function downloadAudit() {
    const blob = new Blob([JSON.stringify(adminAudit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neuroedge_audit_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={pageStyle}>
      <div style={hero}>
        <div>
          <h2 style={{ margin: 0 }}>NeuroEdge Command Center</h2>
          <div style={muted}>Founder-grade control across product, security, agents, and enterprise operations.</div>
        </div>
      </div>

      <div style={serviceBar}>
        {services.map((s) => (
          <div key={s.name} style={serviceChip(s.status)}>
            <strong>{s.name}</strong>
            <span>{s.detail}</span>
          </div>
        ))}
      </div>

      <div style={tabs}>
        {[
          ["founder", "Founder Dashboard"],
          ["admin", "Admin Dashboard"],
          ["developer", "Developer Dashboard"],
          ["ai_agent", "AI Agent Dashboard"],
          ["user", "User Dashboard"],
          ["enterprise", "Enterprise Dashboard"],
        ].map(([id, label]) => (
          <button key={id} style={tabBtn(view === id)} onClick={() => setView(id as DashboardView)}>
            {label}
          </button>
        ))}
      </div>

      {view === "founder" && renderFounder()}
      {view === "admin" && renderAdmin()}
      {view === "developer" && renderDeveloper()}
      {view === "ai_agent" && renderAIAgent()}
      {view === "user" && renderUser()}
      {view === "enterprise" && renderEnterprise()}

      <div style={{ marginTop: 16, color: "#94a3b8", fontSize: "0.8rem" }}>
        Kernel Snapshot: {kernels.map((k) => `${k.name}:${k.status}`).join(" | ") || "none"}
        {" • "}
        Messages: {localMessageStats.total} (errors {localMessageStats.errors}, warnings {localMessageStats.warnings})
        {" • "}
        Version: {adminVersion.orchestratorVersion || "unknown"} / Doctrine v{String(adminVersion.doctrineVersion || "-")}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
    <span style={muted}>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={card}>
    <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3>
    <div style={{ display: "grid", gap: 8 }}>{children}</div>
  </div>
);

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(1)} ${units[idx]}`;
}

function maskKey(key: string) {
  if (!key) return "not set";
  if (key.length < 10) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const pageStyle: React.CSSProperties = {
  padding: "1.2rem",
  overflowY: "auto",
  height: "100%",
  background:
    "radial-gradient(circle at 10% -20%, rgba(37,99,235,0.18), transparent 40%), radial-gradient(circle at 90% -20%, rgba(6,182,212,0.16), transparent 38%), linear-gradient(180deg,#0f172a,#0b1220)",
  color: "#e2e8f0",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const hero: React.CSSProperties = {
  marginBottom: 12,
  padding: "0.9rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.26)",
  background: "rgba(15,23,42,0.72)",
};

const serviceBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const serviceChip = (status: ServiceStatus["status"]): React.CSSProperties => ({
  display: "grid",
  gap: 2,
  minWidth: 180,
  padding: "0.55rem 0.7rem",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  background:
    status === "online" ? "rgba(34,197,94,0.16)" : status === "degraded" ? "rgba(250,204,21,0.16)" : "rgba(239,68,68,0.16)",
  fontSize: "0.82rem",
});

const tabs: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  border: active ? "1px solid rgba(96,165,250,0.7)" : "1px solid rgba(148,163,184,0.3)",
  borderRadius: 9,
  background: active ? "rgba(30,64,175,0.35)" : "rgba(15,23,42,0.72)",
  color: "#e2e8f0",
  padding: "0.42rem 0.68rem",
  cursor: "pointer",
  fontSize: "0.78rem",
});

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 10,
};

const card: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(15,23,42,0.74)",
  padding: "0.88rem",
  boxShadow: "0 10px 30px rgba(2,6,23,0.3)",
};

const muted: React.CSSProperties = { color: "#94a3b8", fontSize: "0.82rem" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const logRow: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8,
  padding: "0.35rem 0.5rem",
  fontSize: "0.8rem",
  background: "rgba(15,23,42,0.5)",
};
const alertRow: React.CSSProperties = { ...logRow, border: "1px solid rgba(239,68,68,0.35)" };
const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.62)",
  color: "#e2e8f0",
  padding: "0.42rem 0.52rem",
  fontSize: "0.8rem",
};
const chipBtn: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
  background: "rgba(15,23,42,0.8)",
  color: "#e2e8f0",
  padding: "0.28rem 0.48rem",
  fontSize: "0.74rem",
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  ...chipBtn,
  border: "none",
  background: "#2563eb",
  color: "#fff",
};

export default Dashboard;
