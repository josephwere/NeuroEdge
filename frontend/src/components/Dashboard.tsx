import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { chatContext } from "@/services/chatContext";
import { listConversations } from "@/services/conversationStore";

type View = "founder" | "admin" | "developer" | "agents" | "user" | "enterprise";

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

interface UsageSummary {
  totals?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: "user" | "moderator" | "admin" | "founder";
  status: "active" | "pending" | "review" | "banned" | "verified";
}

interface Offer {
  id: string;
  name: string;
  discountPct: number;
  active: boolean;
  audience: "all" | "new_users" | "enterprise";
}

interface Plan {
  id: string;
  name: string;
  monthly: number;
  annual: number;
  features: string[];
  active: boolean;
}

interface PaymentProfile {
  cardHolder: string;
  cardNumberMasked: string;
  expMonth: string;
  expYear: string;
  billingEmail: string;
  country: string;
  taxId: string;
  saveForAutoRenew: boolean;
}

interface ModelControl {
  model: string;
  temperature: number;
  maxTokens: number;
  safetyMode: "strict" | "balanced" | "open";
}

interface FeatureFlags {
  [key: string]: boolean;
}

interface SupportTicket {
  id: string;
  subject: string;
  priority: "low" | "medium" | "high";
  status: "open" | "triaged" | "resolved";
  assignee: string;
}

interface DevApiKey {
  id: string;
  name: string;
  keyMasked: string;
  createdAt: number;
  revoked: boolean;
}

interface WebhookRecord {
  id: string;
  url: string;
  event: string;
  active: boolean;
}

interface AgentProfile {
  id: string;
  name: string;
  memoryDays: number;
  tools: string[];
  permission: "workspace" | "project" | "read_only";
}

interface SavedPrompt {
  id: string;
  title: string;
  text: string;
}

interface EnterpriseDepartment {
  id: string;
  name: string;
  members: number;
  tokensPerMonth: number;
}

const Dashboard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [view, setView] = useState<View>("founder");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [kernels, setKernels] = useState<KernelSnapshot[]>([]);
  const [usage, setUsage] = useState<UsageSummary>({});
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const [adminAgents, setAdminAgents] = useState<any[]>([]);
  const [adminVersion, setAdminVersion] = useState<any>({});
  const [adminMetrics, setAdminMetrics] = useState<any>({});

  const [users, setUsers] = useState<UserRecord[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_users_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "u1", name: "Joseph Were", email: "founder@neuroedge.ai", role: "founder", status: "verified" },
            { id: "u2", name: "Guest User", email: "guest@local", role: "user", status: "active" },
            { id: "u3", name: "Ops Moderator", email: "ops@neuroedge.ai", role: "moderator", status: "active" },
          ];
    } catch {
      return [];
    }
  });

  const [offers, setOffers] = useState<Offer[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_offers_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "off1", name: "Launch Promo", discountPct: 20, active: true, audience: "new_users" },
            { id: "off2", name: "Enterprise Pilot", discountPct: 15, active: false, audience: "enterprise" },
          ];
    } catch {
      return [];
    }
  });

  const [plans, setPlans] = useState<Plan[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_plans_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "p1", name: "Free", monthly: 0, annual: 0, active: true, features: ["Basic Chat", "History"] },
            { id: "p2", name: "Pro", monthly: 19, annual: 190, active: true, features: ["Advanced Models", "Research", "API"] },
            { id: "p3", name: "Enterprise", monthly: 99, annual: 990, active: true, features: ["SSO", "Audit Export", "Dedicated Support"] },
          ];
    } catch {
      return [];
    }
  });

  const [payment, setPayment] = useState<PaymentProfile>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_payment_v1");
      return raw
        ? JSON.parse(raw)
        : {
            cardHolder: "",
            cardNumberMasked: "",
            expMonth: "",
            expYear: "",
            billingEmail: "",
            country: "",
            taxId: "",
            saveForAutoRenew: true,
          };
    } catch {
      return {
        cardHolder: "",
        cardNumberMasked: "",
        expMonth: "",
        expYear: "",
        billingEmail: "",
        country: "",
        taxId: "",
        saveForAutoRenew: true,
      };
    }
  });

  const [paymentDraftCard, setPaymentDraftCard] = useState("");
  const [modelControl, setModelControl] = useState<ModelControl>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_model_control_v2");
      return raw
        ? JSON.parse(raw)
        : {
            model: "neuroedge-13b-instruct",
            temperature: 0.3,
            maxTokens: 2048,
            safetyMode: "balanced",
          };
    } catch {
      return {
        model: "neuroedge-13b-instruct",
        temperature: 0.3,
        maxTokens: 2048,
        safetyMode: "balanced",
      };
    }
  });

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_feature_flags_v2");
      return raw
        ? JSON.parse(raw)
        : {
            research_pipeline: true,
            streaming_tokens: true,
            mesh_inference: true,
            strict_citations: true,
            founder_mode: true,
            multimodal_uploads: false,
            auto_eval_nightly: true,
            enterprise_sso: false,
          };
    } catch {
      return {};
    }
  });

  const [devWebhook, setDevWebhook] = useState("");
  const [devEnvironment, setDevEnvironment] = useState<"dev" | "staging" | "prod">("dev");
  const [devApiKeys, setDevApiKeys] = useState<DevApiKey[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dev_api_keys_v1");
      return raw
        ? JSON.parse(raw)
        : [{ id: "k1", name: "Default SDK Key", keyMasked: "neur...9x3a", createdAt: Date.now(), revoked: false }];
    } catch {
      return [];
    }
  });
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_webhooks_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [webhookEvent, setWebhookEvent] = useState("chat.completed");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_support_tickets_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "t-1001", subject: "Login failed", priority: "medium", status: "open", assignee: "ops" },
            { id: "t-1002", subject: "Billing mismatch", priority: "high", status: "triaged", assignee: "finance" },
          ];
    } catch {
      return [];
    }
  });
  const [newTicket, setNewTicket] = useState("");
  const [agentsLocal, setAgentsLocal] = useState<AgentProfile[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_agent_profiles_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "ag1", name: "Research Agent", memoryDays: 30, tools: ["research", "web"], permission: "workspace" },
            { id: "ag2", name: "Code Agent", memoryDays: 14, tools: ["code", "files"], permission: "project" },
          ];
    } catch {
      return [];
    }
  });
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_saved_prompts_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "sp1", title: "Research Brief", text: "Summarize latest trends with sources." },
            { id: "sp2", title: "Code Review", text: "Review this code for bugs and regressions." },
          ];
    } catch {
      return [];
    }
  });
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [newPromptText, setNewPromptText] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentMembers, setNewDepartmentMembers] = useState("5");
  const [newDepartmentTokens, setNewDepartmentTokens] = useState("50000");
  const [enterpriseDepartments, setEnterpriseDepartments] = useState<EnterpriseDepartment[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_enterprise_departments_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "d1", name: "Engineering", members: 12, tokensPerMonth: 210000 },
            { id: "d2", name: "Support", members: 7, tokensPerMonth: 54000 },
          ];
    } catch {
      return [];
    }
  });
  const [ssoConfig, setSsoConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("neuroedge_enterprise_sso_v1");
      return raw
        ? JSON.parse(raw)
        : {
            enabled: false,
            provider: "okta",
            domain: "",
            clientId: "",
            metadataUrl: "",
          };
    } catch {
      return { enabled: false, provider: "okta", domain: "", clientId: "", metadataUrl: "" };
    }
  });
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferPct, setNewOfferPct] = useState("10");
  const [futureFeatures, setFutureFeatures] = useState([
    { id: "f1", name: "Voice-native AI Calls", phase: "design", owner: "founder", priority: "high" },
    { id: "f2", name: "Autonomous Workflow Builder", phase: "in_progress", owner: "platform", priority: "high" },
    { id: "f3", name: "Enterprise Data Residency", phase: "planned", owner: "enterprise", priority: "medium" },
    { id: "f4", name: "Realtime Co-Pilot Screen Assist", phase: "planned", owner: "product", priority: "high" },
  ]);

  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_users_v1", JSON.stringify(users));
  }, [users]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_offers_v1", JSON.stringify(offers));
  }, [offers]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_plans_v1", JSON.stringify(plans));
  }, [plans]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_payment_v1", JSON.stringify(payment));
  }, [payment]);
  useEffect(() => {
    localStorage.setItem("neuroedge_feature_flags_v2", JSON.stringify(featureFlags));
  }, [featureFlags]);
  useEffect(() => {
    localStorage.setItem("neuroedge_model_control_v2", JSON.stringify(modelControl));
  }, [modelControl]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dev_api_keys_v1", JSON.stringify(devApiKeys));
  }, [devApiKeys]);
  useEffect(() => {
    localStorage.setItem("neuroedge_webhooks_v1", JSON.stringify(webhooks));
  }, [webhooks]);
  useEffect(() => {
    localStorage.setItem("neuroedge_support_tickets_v1", JSON.stringify(supportTickets));
  }, [supportTickets]);
  useEffect(() => {
    localStorage.setItem("neuroedge_agent_profiles_v1", JSON.stringify(agentsLocal));
  }, [agentsLocal]);
  useEffect(() => {
    localStorage.setItem("neuroedge_saved_prompts_v1", JSON.stringify(savedPrompts));
  }, [savedPrompts]);
  useEffect(() => {
    localStorage.setItem("neuroedge_enterprise_departments_v1", JSON.stringify(enterpriseDepartments));
  }, [enterpriseDepartments]);
  useEffect(() => {
    localStorage.setItem("neuroedge_enterprise_sso_v1", JSON.stringify(ssoConfig));
  }, [ssoConfig]);
  useEffect(() => {
    if (!agentsLocal.length) {
      setSelectedAgentId("");
      return;
    }
    if (!selectedAgentId || !agentsLocal.find((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(agentsLocal[0].id);
    }
  }, [agentsLocal, selectedAgentId]);

  const authContext = () => {
    const envToken = String((import.meta.env.VITE_NEUROEDGE_JWT as string) || "").trim();
    const envApiKey = String((import.meta.env.VITE_NEUROEDGE_API_KEY as string) || "").trim();
    const envOrg = String((import.meta.env.VITE_DEFAULT_ORG_ID as string) || "personal").trim();
    const envWorkspace = String((import.meta.env.VITE_DEFAULT_WORKSPACE_ID as string) || "default").trim();
    return { token: envToken, apiKey: envApiKey, orgId: envOrg, workspaceId: envWorkspace };
  };

  const apiBase = String(import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:7070");
  const headers = () => {
    const auth = authContext();
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-org-id": auth.orgId,
      "x-workspace-id": auth.workspaceId,
    };
    if (auth.token) h.Authorization = `Bearer ${auth.token}`;
    if (auth.apiKey) h["x-api-key"] = auth.apiKey;
    return h;
  };

  const getJson = async (path: string) => {
    const res = await fetch(`${apiBase}${path}`, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  useEffect(() => {
    const refresh = async () => {
      const nextServices: ServiceStatus[] = [];
      try {
        const orchestratorHealth = await getJson("/health");
        nextServices.push({
          name: "Orchestrator",
          status: orchestratorHealth?.status === "ok" ? "online" : "degraded",
          detail: orchestratorHealth?.status === "ok" ? "Serving API" : "Health degraded",
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

      const calls = await Promise.allSettled([
        getJson("/kernels"),
        getJson("/admin/usage"),
        getJson("/admin/logs?limit=250"),
        getJson("/admin/audit?limit=250"),
        getJson("/admin/agents"),
        getJson("/admin/version"),
        getJson("/admin/system/metrics"),
      ]);
      if (calls[0].status === "fulfilled") {
        const ks: KernelSnapshot[] = Object.entries(calls[0].value || {}).map(([name, info]: [string, any]) => ({
          name,
          status: info?.status || "unknown",
          version: info?.version || "unknown",
        }));
        setKernels(ks);
      }
      if (calls[1].status === "fulfilled") setUsage(calls[1].value?.usage || {});
      if (calls[2].status === "fulfilled") setAdminLogs(calls[2].value?.logs || []);
      if (calls[3].status === "fulfilled") setAdminAudit(calls[3].value?.audit || []);
      if (calls[4].status === "fulfilled") setAdminAgents(calls[4].value?.agents || []);
      if (calls[5].status === "fulfilled") setAdminVersion(calls[5].value || {});
      if (calls[6].status === "fulfilled") setAdminMetrics(calls[6].value || {});
    };
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  const localMsgStats = useMemo(() => {
    const all = chatContext.getAll();
    return {
      total: all.length,
      errors: all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("❌")).length,
      warnings: all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("⚠️")).length,
    };
  }, []);

  const conversationStats = useMemo(() => {
    const all = listConversations();
    return {
      chats: all.length,
      messages: all.reduce((acc, c) => acc + c.messages.length, 0),
      latest: all[0]?.title || "No chats yet",
    };
  }, []);

  const tokenTotal = Number(usage?.totals?.totalTokens || 0);
  const reqTotal = Number(usage?.totals?.requests || 0);
  const estRevenue = Number(((tokenTotal / 1_000_000) * 8.5).toFixed(2));
  const securityAlerts = adminAudit.filter((a) =>
    String(a?.type || "").startsWith("doctrine.") || String(a?.type || "").startsWith("policy.")
  );

  const assignRole = (id: string, role: UserRecord["role"]) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    addNotification({ type: "success", message: `Role updated for ${id}` });
  };

  const updateUserStatus = (id: string, status: UserRecord["status"]) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    addNotification({ type: "success", message: `Status updated for ${id}` });
  };

  const savePaymentDetails = () => {
    const digits = paymentDraftCard.replace(/\D/g, "");
    if (digits.length < 12) {
      addNotification({ type: "error", message: "Enter a valid payment card number." });
      return;
    }
    const masked = `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
    setPayment((prev) => ({ ...prev, cardNumberMasked: masked }));
    setPaymentDraftCard("");
    addNotification({ type: "success", message: "Payment profile saved in dashboard settings." });
  };

  const addOffer = () => {
    const pct = Number(newOfferPct);
    if (!newOfferName.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 90) {
      addNotification({ type: "error", message: "Enter offer name and discount (1-90)." });
      return;
    }
    setOffers((prev) => [
      ...prev,
      {
        id: `off-${Date.now()}`,
        name: newOfferName.trim(),
        discountPct: pct,
        active: true,
        audience: "all",
      },
    ]);
    setNewOfferName("");
    setNewOfferPct("10");
    addNotification({ type: "success", message: "Offer created." });
  };

  const toggleFlag = (k: string) => {
    setFeatureFlags((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const addPlan = () => {
    const name = window.prompt("Plan name:");
    if (!name) return;
    const monthly = Number(window.prompt("Monthly price:", "29"));
    const annual = Number(window.prompt("Annual price:", "290"));
    if (!Number.isFinite(monthly) || !Number.isFinite(annual)) return;
    setPlans((prev) => [
      ...prev,
      { id: `p-${Date.now()}`, name, monthly, annual, active: true, features: ["Custom Plan"] },
    ]);
    addNotification({ type: "success", message: `${name} plan added.` });
  };

  const exportData = (name: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestServiceRestart = async (service: "kernel" | "ml" | "orchestrator" | "frontend") => {
    try {
      const res = await fetch(`${apiBase}/admin/restart`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ service, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "restart request failed");
      addNotification({ type: "info", message: data?.message || `Restart requested for ${service}` });
    } catch (err: any) {
      addNotification({ type: "error", message: `Restart request failed: ${err?.message || err}` });
    }
  };

  const addDevApiKey = () => {
    const name = window.prompt("API key name:", "New API Key");
    if (!name) return;
    const suffix = Math.random().toString(36).slice(-4);
    setDevApiKeys((prev) => [
      {
        id: `k-${Date.now()}`,
        name: name.trim(),
        keyMasked: `neur...${suffix}`,
        createdAt: Date.now(),
        revoked: false,
      },
      ...prev,
    ]);
    addNotification({ type: "success", message: "API key created." });
  };

  const addWebhook = () => {
    if (!devWebhook.trim()) {
      addNotification({ type: "error", message: "Enter a webhook URL first." });
      return;
    }
    setWebhooks((prev) => [
      ...prev,
      { id: `wh-${Date.now()}`, url: devWebhook.trim(), event: webhookEvent, active: true },
    ]);
    addNotification({ type: "success", message: "Webhook added." });
  };

  const testWebhook = async (id: string) => {
    const hook = webhooks.find((w) => w.id === id);
    if (!hook) return;
    addNotification({ type: "info", message: `Webhook test sent to ${hook.url}` });
  };

  const addSupportTicket = () => {
    const subject = newTicket.trim();
    if (!subject) return;
    setSupportTickets((prev) => [
      { id: `t-${Date.now()}`, subject, priority: "medium", status: "open", assignee: "unassigned" },
      ...prev,
    ]);
    setNewTicket("");
    addNotification({ type: "success", message: "Support ticket created." });
  };

  const addAgentProfile = () => {
    const name = window.prompt("Agent name:", "New Agent");
    if (!name) return;
    setAgentsLocal((prev) => [
      ...prev,
      {
        id: `ag-${Date.now()}`,
        name: name.trim(),
        memoryDays: 30,
        tools: ["chat"],
        permission: "workspace",
      },
    ]);
  };

  const addSavedPrompt = () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) {
      addNotification({ type: "error", message: "Add prompt title and text." });
      return;
    }
    setSavedPrompts((prev) => [
      { id: `sp-${Date.now()}`, title: newPromptTitle.trim(), text: newPromptText.trim() },
      ...prev,
    ]);
    setNewPromptTitle("");
    setNewPromptText("");
    addNotification({ type: "success", message: "Prompt saved." });
  };

  const selectedAgent = agentsLocal.find((a) => a.id === selectedAgentId) || null;

  const updateAgent = (id: string, patch: Partial<AgentProfile>) => {
    setAgentsLocal((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const toggleAgentTool = (id: string, tool: string) => {
    setAgentsLocal((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const has = a.tools.includes(tool);
        return { ...a, tools: has ? a.tools.filter((t) => t !== tool) : [...a.tools, tool] };
      })
    );
  };

  const addDepartment = () => {
    const name = newDepartmentName.trim();
    const members = Number(newDepartmentMembers);
    const tokens = Number(newDepartmentTokens);
    if (!name || !Number.isFinite(members) || members <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
      addNotification({ type: "error", message: "Enter a valid department, members, and token budget." });
      return;
    }
    setEnterpriseDepartments((prev) => [
      ...prev,
      { id: `d-${Date.now()}`, name, members, tokensPerMonth: tokens },
    ]);
    setNewDepartmentName("");
    setNewDepartmentMembers("5");
    setNewDepartmentTokens("50000");
    addNotification({ type: "success", message: "Department added." });
  };

  const founderView = (
    <div style={grid}>
      <Card title="Platform Analytics">
        <Stat label="Users" value={String(users.length)} />
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Token Usage" value={tokenTotal.toLocaleString()} />
        <Stat label="Estimated Revenue" value={`$${estRevenue}`} />
      </Card>
      <Card title="Subscription & Plan Control">
        {plans.map((p) => (
          <div key={p.id} style={row}>
            <span>{p.name} (${p.monthly}/mo, ${p.annual}/yr)</span>
            <button style={chip} onClick={() => setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))}>
              {p.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
        <button style={primary} onClick={addPlan}>+ Add Plan</button>
      </Card>
      <Card title="Payment Profile (Dashboard-Managed)">
        <input placeholder="Card holder" value={payment.cardHolder} onChange={(e) => setPayment((p) => ({ ...p, cardHolder: e.target.value }))} style={input} />
        <input placeholder="Card number" value={paymentDraftCard} onChange={(e) => setPaymentDraftCard(e.target.value)} style={input} />
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="MM" value={payment.expMonth} onChange={(e) => setPayment((p) => ({ ...p, expMonth: e.target.value }))} style={input} />
          <input placeholder="YYYY" value={payment.expYear} onChange={(e) => setPayment((p) => ({ ...p, expYear: e.target.value }))} style={input} />
        </div>
        <input placeholder="Billing email" value={payment.billingEmail} onChange={(e) => setPayment((p) => ({ ...p, billingEmail: e.target.value }))} style={input} />
        <input placeholder="Country" value={payment.country} onChange={(e) => setPayment((p) => ({ ...p, country: e.target.value }))} style={input} />
        <input placeholder="Tax ID (optional)" value={payment.taxId} onChange={(e) => setPayment((p) => ({ ...p, taxId: e.target.value }))} style={input} />
        <div style={muted}>Stored card: {payment.cardNumberMasked || "not set"}</div>
        <button style={primary} onClick={savePaymentDetails}>Save Payment Details</button>
      </Card>
      <Card title="Role Governance">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name} ({u.role})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
                <option value="founder">founder</option>
              </select>
              <button style={chip} onClick={() => updateUserStatus(u.id, "banned")}>Ban</button>
              <button style={chip} onClick={() => updateUserStatus(u.id, "verified")}>Verify</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Model Control">
        <select value={modelControl.model} onChange={(e) => setModelControl((p) => ({ ...p, model: e.target.value }))} style={input}>
          <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
          <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
          <option value="neuroedge-70b-router">neuroedge-70b-router</option>
        </select>
        <input type="number" value={modelControl.temperature} onChange={(e) => setModelControl((p) => ({ ...p, temperature: Number(e.target.value) || 0 }))} style={input} />
        <input type="number" value={modelControl.maxTokens} onChange={(e) => setModelControl((p) => ({ ...p, maxTokens: Number(e.target.value) || 1024 }))} style={input} />
        <select value={modelControl.safetyMode} onChange={(e) => setModelControl((p) => ({ ...p, safetyMode: e.target.value as ModelControl["safetyMode"] }))} style={input}>
          <option value="strict">strict</option>
          <option value="balanced">balanced</option>
          <option value="open">open</option>
        </select>
      </Card>
      <Card title="Feature Flags">
        {Object.keys(featureFlags).map((k) => (
          <div key={k} style={row}>
            <span>{k}</span>
            <button style={chip} onClick={() => toggleFlag(k)}>
              {featureFlags[k] ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </Card>
      <Card title="System Health & Security">
        <Stat label="Uptime" value={`${adminMetrics?.uptimeSec || 0}s`} />
        <Stat label="Heap Used" value={formatBytes(adminMetrics?.memory?.heapUsed || 0)} />
        <Stat label="Security Alerts" value={String(securityAlerts.length)} />
        <button style={chip} onClick={() => exportData("security_alerts", securityAlerts)}>Export Alerts</button>
      </Card>
      <Card title="Operations Control">
        <div style={row}>
          <span>Restart Kernel</span>
          <button style={chip} onClick={() => requestServiceRestart("kernel")}>Request</button>
        </div>
        <div style={row}>
          <span>Restart ML</span>
          <button style={chip} onClick={() => requestServiceRestart("ml")}>Request</button>
        </div>
        <div style={row}>
          <span>Restart Orchestrator</span>
          <button style={chip} onClick={() => requestServiceRestart("orchestrator")}>Request</button>
        </div>
      </Card>
      <Card title="Future Feature Pipeline">
        {futureFeatures.map((f) => (
          <div key={f.id} style={log}>
            {f.name} • {f.phase} • {f.priority}
          </div>
        ))}
      </Card>
    </div>
  );

  const adminView = (
    <div style={grid}>
      <Card title="User Moderation">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name} ({u.status})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => updateUserStatus(u.id, u.status === "active" ? "review" : "active")}>
                {u.status === "active" ? "Flag" : "Restore"}
              </button>
              <button style={chip} onClick={() => assignRole(u.id, u.role === "admin" ? "moderator" : "admin")}>
                {u.role === "admin" ? "Demote" : "Promote"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Offer Management">
        <input placeholder="Offer name" value={newOfferName} onChange={(e) => setNewOfferName(e.target.value)} style={input} />
        <input placeholder="Discount %" value={newOfferPct} onChange={(e) => setNewOfferPct(e.target.value)} style={input} />
        <button style={primary} onClick={addOffer}>Create Offer</button>
        {offers.map((o) => (
          <div key={o.id} style={row}>
            <span>{o.name} ({o.discountPct}% / {o.audience})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={o.audience}
                onChange={(e) => setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, audience: e.target.value as Offer["audience"] } : x)))}
                style={{ ...input, width: 120 }}
              >
                <option value="all">all</option>
                <option value="new_users">new users</option>
                <option value="enterprise">enterprise</option>
              </select>
              <button style={chip} onClick={() => setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x)))}>
                {o.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Content Review Queue">
        {adminLogs.slice(0, 12).map((l, i) => (
          <div key={i} style={log}>{l.type}</div>
        ))}
      </Card>
      <Card title="Support Tickets">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTicket} onChange={(e) => setNewTicket(e.target.value)} placeholder="Ticket subject..." style={input} />
          <button style={primary} onClick={addSupportTicket}>Add</button>
        </div>
        {supportTickets.map((t) => (
          <div key={t.id} style={row}>
            <span>{t.id} • {t.subject}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={t.status}
                onChange={(e) => setSupportTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: e.target.value as SupportTicket["status"] } : x)))}
                style={{ ...input, width: 110 }}
              >
                <option value="open">open</option>
                <option value="triaged">triaged</option>
                <option value="resolved">resolved</option>
              </select>
              <button style={chip} onClick={() => setSupportTickets((prev) => prev.filter((x) => x.id !== t.id))}>Close</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Activity & Reports">
        <Stat label="Logs" value={String(adminLogs.length)} />
        <Stat label="Audit events" value={String(adminAudit.length)} />
        <button style={chip} onClick={() => exportData("admin_audit", adminAudit)}>Export Report</button>
      </Card>
    </div>
  );

  const developerView = (
    <div style={grid}>
      <Card title="API Keys">
        <div style={log}>Primary key: {maskKey(String(import.meta.env.VITE_NEUROEDGE_API_KEY || ""))}</div>
        <button style={chip} onClick={addDevApiKey}>+ Create Key</button>
        {devApiKeys.map((k) => (
          <div key={k.id} style={row}>
            <span>{k.name} • {k.keyMasked}</span>
            <button
              style={chip}
              onClick={() => setDevApiKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, revoked: !x.revoked } : x)))}
            >
              {k.revoked ? "Restore" : "Revoke"}
            </button>
          </div>
        ))}
      </Card>
      <Card title="Usage Tracking">
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Total Tokens" value={tokenTotal.toLocaleString()} />
        <Stat label="Input Tokens" value={String(usage?.totals?.inputTokens || 0)} />
        <Stat label="Output Tokens" value={String(usage?.totals?.outputTokens || 0)} />
      </Card>
      <Card title="Webhook Setup">
        <input value={devWebhook} onChange={(e) => setDevWebhook(e.target.value)} placeholder="https://example.com/webhook" style={input} />
        <select value={webhookEvent} onChange={(e) => setWebhookEvent(e.target.value)} style={input}>
          <option value="chat.completed">chat.completed</option>
          <option value="ai.inference.done">ai.inference.done</option>
          <option value="agent.run.finished">agent.run.finished</option>
        </select>
        <button style={chip} onClick={addWebhook}>Save Webhook</button>
        {webhooks.map((w) => (
          <div key={w.id} style={row}>
            <span>{w.event} → {w.url}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => testWebhook(w.id)}>Test</button>
              <button style={chip} onClick={() => setWebhooks((prev) => prev.filter((x) => x.id !== w.id))}>Delete</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Model & Env">
        <select value={modelControl.model} onChange={(e) => setModelControl((p) => ({ ...p, model: e.target.value }))} style={input}>
          <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
          <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
          <option value="neuroedge-70b-router">neuroedge-70b-router</option>
        </select>
        <select value={devEnvironment} onChange={(e) => setDevEnvironment(e.target.value as any)} style={input}>
          <option value="dev">dev</option>
          <option value="staging">staging</option>
          <option value="prod">prod</option>
        </select>
      </Card>
      <Card title="Debug Tools">
        <button style={chip} onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "history" }))}>Open History + Logs</button>
        <button style={chip} onClick={() => exportData("debug_logs", adminLogs.slice(0, 100))}>Export Debug Logs</button>
      </Card>
    </div>
  );

  const agentView = (
    <div style={grid}>
      <Card title="Agent Studio">
        <button style={primary} onClick={addAgentProfile}>+ Create Agent</button>
        {agentsLocal.length === 0 ? <div style={muted}>No agents configured yet.</div> : agentsLocal.map((a) => (
          <div key={a.id} style={{ ...row, ...(selectedAgentId === a.id ? { border: "1px solid rgba(125,211,252,0.55)", borderRadius: 8, padding: 6 } : {}) }}>
            <button style={chip} onClick={() => setSelectedAgentId(a.id)}>{a.name}</button>
            <button style={chip} onClick={() => setAgentsLocal((prev) => prev.filter((x) => x.id !== a.id))}>Delete</button>
          </div>
        ))}
        {adminAgents.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={muted}>Live runtime agents</div>
            {adminAgents.map((a: any, i: number) => (
              <div key={`live-${i}`} style={log}>{a.name || `Agent-${i + 1}`} • {a.status || "running"}</div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Knowledge Base & Prompting">
        <input type="file" style={{ color: "var(--ne-fg)" }} />
        {selectedAgent ? (
          <>
            <input
              value={selectedAgent.name}
              onChange={(e) => updateAgent(selectedAgent.id, { name: e.target.value })}
              style={input}
            />
            <textarea
              value={`You are ${selectedAgent.name}. Operate with ${selectedAgent.permission} permission and ${selectedAgent.memoryDays}d memory.`}
              readOnly
              style={{ ...input, minHeight: 120 }}
            />
          </>
        ) : (
          <div style={muted}>Select an agent to edit its settings.</div>
        )}
      </Card>
      <Card title="Integrations & Permissions">
        {selectedAgent ? (
          <>
            <div style={row}>
              <span>Permission</span>
              <select
                value={selectedAgent.permission}
                onChange={(e) => updateAgent(selectedAgent.id, { permission: e.target.value as AgentProfile["permission"] })}
                style={{ ...input, width: 140 }}
              >
                <option value="workspace">workspace</option>
                <option value="project">project</option>
                <option value="read_only">read_only</option>
              </select>
            </div>
            {["research", "code", "math", "files", "webhooks", "chat"].map((tool) => (
              <div key={tool} style={row}>
                <span>{tool}</span>
                <button style={chip} onClick={() => toggleAgentTool(selectedAgent.id, tool)}>
                  {selectedAgent.tools.includes(tool) ? "Enabled" : "Disabled"}
                </button>
              </div>
            ))}
          </>
        ) : (
          <div style={muted}>No agent selected.</div>
        )}
      </Card>
      <Card title="Analytics + Memory Control">
        <Stat label="Agent events" value={String(adminLogs.filter((e) => String(e.type).includes("agent")).length)} />
        {selectedAgent ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={selectedAgent.memoryDays}
              onChange={(e) => updateAgent(selectedAgent.id, { memoryDays: Number(e.target.value) || 1 })}
              style={{ ...input, width: 120 }}
            />
            <button style={chip} onClick={() => addNotification({ type: "success", message: "Memory policy updated." })}>Save</button>
          </div>
        ) : (
          <div style={muted}>Select an agent to set memory policy.</div>
        )}
      </Card>
    </div>
  );

  const userView = (
    <div style={grid}>
      <Card title="Chat & Prompt Workspace">
        <Stat label="Chats" value={String(conversationStats.chats)} />
        <Stat label="Messages" value={String(conversationStats.messages)} />
        <Stat label="Latest Chat" value={conversationStats.latest} />
      </Card>
      <Card title="Plan & Usage">
        <Stat label="Plan" value={plans.find((p) => p.active)?.name || "Free"} />
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Tokens" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Payment Details">
        <div style={log}>Billing email: {payment.billingEmail || "not set"}</div>
        <div style={log}>Card: {payment.cardNumberMasked || "not set"}</div>
      </Card>
      <Card title="Saved Files & Notifications">
        <input type="file" style={{ color: "var(--ne-fg)" }} />
        <button style={chip} onClick={() => addNotification({ type: "info", message: "Notifications configured." })}>Configure Notifications</button>
      </Card>
      <Card title="Saved Prompts">
        <input value={newPromptTitle} onChange={(e) => setNewPromptTitle(e.target.value)} placeholder="Prompt title" style={input} />
        <textarea value={newPromptText} onChange={(e) => setNewPromptText(e.target.value)} placeholder="Prompt text..." style={{ ...input, minHeight: 90 }} />
        <button style={primary} onClick={addSavedPrompt}>Save Prompt</button>
        {savedPrompts.map((p) => (
          <div key={p.id} style={row}>
            <span>{p.title}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(p.text)}>Copy</button>
              <button style={chip} onClick={() => setSavedPrompts((prev) => prev.filter((x) => x.id !== p.id))}>Delete</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );

  const enterpriseView = (
    <div style={grid}>
      <Card title="Team Roles & Department Controls">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name}</span>
            <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
              <option value="founder">founder</option>
            </select>
          </div>
        ))}
      </Card>
      <Card title="Usage by Department">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} placeholder="Department name" style={input} />
            <input value={newDepartmentMembers} onChange={(e) => setNewDepartmentMembers(e.target.value)} placeholder="Members" style={{ ...input, maxWidth: 100 }} />
            <input value={newDepartmentTokens} onChange={(e) => setNewDepartmentTokens(e.target.value)} placeholder="Tokens/month" style={{ ...input, maxWidth: 140 }} />
            <button style={primary} onClick={addDepartment}>Add</button>
          </div>
          {enterpriseDepartments.map((d) => (
            <div key={d.id} style={row}>
              <span>{d.name}: {d.tokensPerMonth.toLocaleString()} tokens / month</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  value={d.members}
                  onChange={(e) => setEnterpriseDepartments((prev) => prev.map((x) => (x.id === d.id ? { ...x, members: Number(e.target.value) || 1 } : x)))}
                  style={{ ...input, width: 80 }}
                />
                <button style={chip} onClick={() => setEnterpriseDepartments((prev) => prev.filter((x) => x.id !== d.id))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Billing, Audit, Compliance">
        <button style={chip} onClick={() => exportData("enterprise_audit", adminAudit)}>Export Audit Logs</button>
        <button style={chip} onClick={() => exportData("enterprise_usage", usage)}>Export Usage</button>
      </Card>
      <Card title="SSO & Governance">
        <div style={row}>
          <span>Enable SSO</span>
          <button style={chip} onClick={() => setSsoConfig((prev: any) => ({ ...prev, enabled: !prev.enabled }))}>
            {ssoConfig.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <select
          value={ssoConfig.provider}
          onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, provider: e.target.value }))}
          style={input}
        >
          <option value="okta">okta</option>
          <option value="entra">entra</option>
          <option value="auth0">auth0</option>
          <option value="google-workspace">google-workspace</option>
        </select>
        <input value={ssoConfig.domain} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, domain: e.target.value }))} placeholder="Company domain" style={input} />
        <input value={ssoConfig.clientId} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, clientId: e.target.value }))} placeholder="Client ID" style={input} />
        <input value={ssoConfig.metadataUrl} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, metadataUrl: e.target.value }))} placeholder="Metadata URL" style={input} />
        <button style={primary} onClick={() => addNotification({ type: "success", message: "SSO configuration saved." })}>Save SSO</button>
      </Card>
    </div>
  );

  return (
    <div style={page}>
      <div style={hero}>
        <h2 style={{ margin: 0 }}>NeuroEdge Sovereign Command Center</h2>
        <div style={muted}>
          Founder-grade orchestration for product, revenue, agents, security, and enterprise operations.
        </div>
      </div>

      <div style={serviceGrid}>
        {services.map((s) => (
          <div key={s.name} style={serviceChip(s.status)}>
            <strong>{s.name}</strong>
            <span>{s.detail}</span>
          </div>
        ))}
      </div>

      <div style={tabs}>
        {[
          ["founder", "Founder"],
          ["admin", "Admin"],
          ["developer", "Developer"],
          ["agents", "AI Agents"],
          ["user", "User"],
          ["enterprise", "Enterprise"],
        ].map(([id, label]) => (
          <button key={id} style={tab(view === id)} onClick={() => setView(id as View)}>
            {label}
          </button>
        ))}
      </div>

      {view === "founder" && founderView}
      {view === "admin" && adminView}
      {view === "developer" && developerView}
      {view === "agents" && agentView}
      {view === "user" && userView}
      {view === "enterprise" && enterpriseView}

      <div style={{ marginTop: 14, color: "#94a3b8", fontSize: "0.8rem" }}>
        Kernel Snapshot: {kernels.map((k) => `${k.name}:${k.status}`).join(" | ") || "none"}
        {" • "}
        Messages: {localMsgStats.total} (errors {localMsgStats.errors}, warnings {localMsgStats.warnings})
        {" • "}
        Version: {adminVersion.orchestratorVersion || "unknown"} / Doctrine v{String(adminVersion.doctrineVersion || "-")}
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={card}>
    <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3>
    <div style={{ display: "grid", gap: 8 }}>{children}</div>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={row}>
    <span style={muted}>{label}</span>
    <strong>{value}</strong>
  </div>
);

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function maskKey(key: string) {
  if (!key) return "not set";
  if (key.length < 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const page: React.CSSProperties = {
  padding: "1.2rem",
  overflowY: "auto",
  height: "100%",
  background:
    "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.2), transparent 30%), radial-gradient(circle at 100% 0%, rgba(37,99,235,0.2), transparent 30%), linear-gradient(180deg,#0f172a,#0b1220)",
  color: "#e2e8f0",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const hero: React.CSSProperties = {
  marginBottom: 12,
  padding: "0.9rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.72)",
};

const serviceGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const serviceChip = (status: ServiceStatus["status"]): React.CSSProperties => ({
  display: "grid",
  minWidth: 170,
  gap: 3,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  padding: "0.5rem 0.66rem",
  background:
    status === "online" ? "rgba(34,197,94,0.16)" : status === "degraded" ? "rgba(250,204,21,0.16)" : "rgba(239,68,68,0.16)",
});

const tabs: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 };

const tab = (active: boolean): React.CSSProperties => ({
  border: active ? "1px solid rgba(125,211,252,0.8)" : "1px solid rgba(148,163,184,0.3)",
  borderRadius: 9,
  background: active ? "rgba(30,64,175,0.35)" : "rgba(15,23,42,0.7)",
  color: "#e2e8f0",
  padding: "0.42rem 0.72rem",
  cursor: "pointer",
  fontSize: "0.78rem",
});

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 10,
};

const card: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(15,23,42,0.74)",
  padding: "0.88rem",
  boxShadow: "0 10px 30px rgba(2,6,23,0.35)",
};

const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const log: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8,
  padding: "0.35rem 0.5rem",
  fontSize: "0.8rem",
  background: "rgba(15,23,42,0.5)",
};
const muted: React.CSSProperties = { color: "#94a3b8", fontSize: "0.82rem" };
const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.36)",
  background: "rgba(15,23,42,0.62)",
  color: "#e2e8f0",
  padding: "0.42rem 0.52rem",
  fontSize: "0.8rem",
};
const chip: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
  background: "rgba(15,23,42,0.8)",
  color: "#e2e8f0",
  padding: "0.28rem 0.48rem",
  fontSize: "0.74rem",
  cursor: "pointer",
};
const primary: React.CSSProperties = {
  ...chip,
  border: "none",
  background: "#2563eb",
  color: "#fff",
};

export default Dashboard;
