import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { chatContext } from "@/services/chatContext";
import { listConversations } from "@/services/conversationStore";
import { confirmSafeAction, recoveryGuidance } from "@/services/safetyPrompts";
import { isFounderUser } from "@/services/founderAccess";
import { applyBrandingToDocument, defaultBranding, loadBranding, saveBranding, type BrandingConfig } from "@/services/branding";

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

type UploadTier = "founder" | "admin" | "paid" | "free";

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
  const [twinOutput, setTwinOutput] = useState<any>(null);
  const [backendOutput, setBackendOutput] = useState<any>(null);
  const [twinQuestion, setTwinQuestion] = useState("");
  const [twinZipPath, setTwinZipPath] = useState("");
  const [twinUploadedFiles, setTwinUploadedFiles] = useState<
    Array<{ name: string; type: string; size: number; text_sample: string }>
  >([]);
  const [twinUploadedZips, setTwinUploadedZips] = useState<Array<{ name: string; data_base64: string }>>([]);
  const [twinIncludeAnalyze, setTwinIncludeAnalyze] = useState(true);
  const [twinIncludeReport, setTwinIncludeReport] = useState(true);

  const twinUploadTier = useMemo<UploadTier>(() => {
    if (isFounderUser()) return "founder";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      const role = String(user?.role || "").toLowerCase();
      if (role === "admin" || role === "moderator") return "admin";
      const tier = String(
        user?.plan ||
          localStorage.getItem("neuroedge_plan") ||
          localStorage.getItem("neuroedge_subscription_tier") ||
          ""
      ).toLowerCase();
      if (tier === "pro" || tier === "enterprise" || tier === "paid") return "paid";
    } catch {
      // fallback below
    }
    return "free";
  }, []);

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
  const [brandingDraft, setBrandingDraft] = useState<BrandingConfig>(() => loadBranding());

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
    const sync = () => setBrandingDraft(loadBranding());
    window.addEventListener("neuroedge:brandingUpdated", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("neuroedge:brandingUpdated", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);
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
    let userToken = "";
    let sessionToken = "";
    let userOrg = "";
    let userWorkspace = "";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        userOrg = String(parsed?.orgId || "");
        userWorkspace = String(parsed?.workspaceId || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        userOrg = userOrg || String(parsed?.orgId || "");
        userWorkspace = userWorkspace || String(parsed?.workspaceId || "");
      }
    } catch {
      // ignore localStorage parsing issues and fallback to env defaults
    }
    return {
      token: envToken || userToken || sessionToken,
      apiKey: envApiKey,
      orgId: userOrg || envOrg || "personal",
      workspaceId: userWorkspace || envWorkspace || "default",
    };
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
    if (auth.apiKey) {
      h["x-api-key"] = auth.apiKey;
      if (!h.Authorization) h.Authorization = `Bearer ${auth.apiKey}`;
    }
    return h;
  };

  const getJson = async (path: string) => {
    const res = await fetch(`${apiBase}${path}`, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const postJson = async (path: string, body: unknown) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  };

  const applyRemoteDashboard = (remote: any) => {
    if (!remote || typeof remote !== "object") return;
    if (Array.isArray(remote.users)) setUsers(remote.users);
    if (Array.isArray(remote.offers)) setOffers(remote.offers);
    if (Array.isArray(remote.plans)) setPlans(remote.plans);
    if (remote.payment && typeof remote.payment === "object") setPayment(remote.payment);
    if (remote.modelControl && typeof remote.modelControl === "object") setModelControl(remote.modelControl);
    if (remote.featureFlags && typeof remote.featureFlags === "object") setFeatureFlags(remote.featureFlags);
    if (Array.isArray(remote.supportTickets)) setSupportTickets(remote.supportTickets);
    if (Array.isArray(remote.devApiKeys)) setDevApiKeys(remote.devApiKeys);
    if (Array.isArray(remote.webhooks)) setWebhooks(remote.webhooks);
    if (Array.isArray(remote.agentsLocal)) setAgentsLocal(remote.agentsLocal);
    if (Array.isArray(remote.savedPrompts)) setSavedPrompts(remote.savedPrompts);
    if (Array.isArray(remote.enterpriseDepartments)) setEnterpriseDepartments(remote.enterpriseDepartments);
    if (remote.ssoConfig && typeof remote.ssoConfig === "object") setSsoConfig(remote.ssoConfig);
  };

  const callAction = async (path: string, body: any) => {
    try {
      const data = await postJson(path, body);
      if (Array.isArray(data.users)) setUsers(data.users);
      if (Array.isArray(data.offers)) setOffers(data.offers);
      if (Array.isArray(data.plans)) setPlans(data.plans);
      if (data.payment) setPayment(data.payment);
      if (data.modelControl) setModelControl(data.modelControl);
      if (data.featureFlags) setFeatureFlags(data.featureFlags);
      if (Array.isArray(data.supportTickets)) setSupportTickets(data.supportTickets);
      if (Array.isArray(data.devApiKeys)) setDevApiKeys(data.devApiKeys);
      if (Array.isArray(data.webhooks)) setWebhooks(data.webhooks);
      if (Array.isArray(data.agentsLocal)) setAgentsLocal(data.agentsLocal);
      if (Array.isArray(data.savedPrompts)) setSavedPrompts(data.savedPrompts);
      if (Array.isArray(data.enterpriseDepartments)) setEnterpriseDepartments(data.enterpriseDepartments);
      if (data.ssoConfig) setSsoConfig(data.ssoConfig);
      return data;
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || String(err) });
      return null;
    }
  };

  const runGuarded = async (title: string, fn: () => Promise<any>, actionLabel = "delete") => {
    if (!confirmSafeAction({ title, actionLabel })) return;
    const data = await fn();
    if (data) addNotification({ type: "warn", message: recoveryGuidance(title) });
  };

  useEffect(() => {
    const loadDashboardState = async () => {
      try {
        const data = await getJson("/admin/dashboard/bootstrap");
        applyRemoteDashboard(data?.dashboard || {});
      } catch {
        // fallback to local state
      }
    };
    loadDashboardState();
  }, []);

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

  const assignRole = async (id: string, role: UserRecord["role"]) => {
    await callAction("/admin/dashboard/users/role", { id, role });
    addNotification({ type: "success", message: `Role updated for ${id}` });
  };

  const updateUserStatus = async (id: string, status: UserRecord["status"]) => {
    await callAction("/admin/dashboard/users/status", { id, status });
    addNotification({ type: "success", message: `Status updated for ${id}` });
  };

  const savePaymentDetails = async () => {
    const digits = paymentDraftCard.replace(/\D/g, "");
    if (digits.length < 12) {
      addNotification({ type: "error", message: "Enter a valid payment card number." });
      return;
    }
    const masked = `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
    const nextPayment = { ...payment, cardNumberMasked: masked };
    await callAction("/admin/dashboard/payment/save", { payment: nextPayment });
    setPaymentDraftCard("");
    addNotification({ type: "success", message: "Payment profile saved in dashboard settings." });
  };

  const addOffer = async () => {
    const pct = Number(newOfferPct);
    if (!newOfferName.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 90) {
      addNotification({ type: "error", message: "Enter offer name and discount (1-90)." });
      return;
    }
    await callAction("/admin/dashboard/offers/upsert", {
      offer: {
        name: newOfferName.trim(),
        discountPct: pct,
        active: true,
        audience: "all",
      },
    });
    setNewOfferName("");
    setNewOfferPct("10");
    addNotification({ type: "success", message: "Offer created." });
  };

  const toggleFlag = async (k: string) => {
    await callAction("/admin/dashboard/flags/toggle", { key: k });
  };

  const addPlan = async () => {
    const name = window.prompt("Plan name:");
    if (!name) return;
    const monthly = Number(window.prompt("Monthly price:", "29"));
    const annual = Number(window.prompt("Annual price:", "290"));
    if (!Number.isFinite(monthly) || !Number.isFinite(annual)) return;
    await callAction("/admin/dashboard/plans/upsert", {
      plan: { name, monthly, annual, active: true, features: ["Custom Plan"] },
    });
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

  const toOutputText = (data: unknown) => (typeof data === "string" ? data : JSON.stringify(data, null, 2));

  const downloadText = (name: string, ext: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const exportOutputTxt = (name: string, data: unknown) => {
    downloadText(name, "txt", "text/plain;charset=utf-8", toOutputText(data));
  };

  const exportOutputWord = (name: string, data: unknown) => {
    const safe = escapeHtml(toOutputText(data));
    const docHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><pre>${safe}</pre></body></html>`;
    downloadText(name, "doc", "application/msword", docHtml);
  };

  const printOutputPdf = (title: string, data: unknown) => {
    const w = window.open("", "_blank", "width=1024,height=760");
    if (!w) {
      addNotification({ type: "error", message: "Popup blocked. Allow popups to print/export PDF." });
      return;
    }
    const safe = escapeHtml(toOutputText(data));
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:20px;}h1{font-family:system-ui,sans-serif;font-size:18px;}pre{white-space:pre-wrap;line-height:1.4;}</style></head><body><h1>${title}</h1><pre>${safe}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const saveModelControl = async () => {
    await callAction("/admin/dashboard/model/save", { modelControl });
    addNotification({ type: "success", message: "Model control saved." });
  };

  const runTwinAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Twin action completed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Twin action failed: ${err?.message || err}` });
    }
  };

  const askTwin = async () => {
    const q = twinQuestion.trim();
    if (!q) {
      addNotification({ type: "warn", message: "Type a question for Twin first." });
      return;
    }
    await runTwinAction("/twin/ask", {
      question: q,
      uploaded_files: twinUploadedFiles,
      uploaded_zips: twinUploadedZips,
      zip_path: twinZipPath.trim(),
      include_scan: true,
      include_analyze: twinIncludeAnalyze,
      include_report: twinIncludeReport,
    });
  };

  const handleTwinUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Array<{ name: string; type: string; size: number; text_sample: string }> = [];
    for (const f of Array.from(files).slice(0, 100)) {
      const isTextLike =
        f.type.startsWith("text/") ||
        /\.(md|txt|json|ya?ml|ts|tsx|js|jsx|py|go|rs|java|sql|sh|env|toml|ini|csv)$/i.test(f.name);
      let textSample = "";
      if (isTextLike) {
        try {
          textSample = (await f.text()).slice(0, 8000);
        } catch {
          textSample = "";
        }
      }
      next.push({
        name: (f as any).webkitRelativePath || f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        text_sample: textSample,
      });
    }
    setTwinUploadedFiles((prev) => [...prev, ...next]);
    addNotification({ type: "success", message: `Twin received ${next.length} file(s).` });
  };

  const handleTwinZipUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const tierLimitsMb: Record<UploadTier, { perZip: number; total: number; wire: number }> = {
      founder: { perZip: 102400, total: 307200, wire: 30 }, // 100GB each, 300GB total policy
      admin: { perZip: 20480, total: 61440, wire: 25 }, // 20GB each, 60GB total policy
      paid: { perZip: 5120, total: 15360, wire: 20 }, // 5GB each, 15GB total policy
      free: { perZip: Number(import.meta.env.VITE_TWIN_MAX_ZIP_MB || 8), total: Number(import.meta.env.VITE_TWIN_MAX_TOTAL_ZIP_MB || 20), wire: 12 },
    };
    const policy = tierLimitsMb[twinUploadTier];
    const maxZipMb = policy.perZip;
    const maxTotalMb = policy.total;
    const maxWireMb = policy.wire; // direct JSON/base64 transfer practical ceiling
    const maxZipBytes = Math.max(1, maxZipMb) * 1024 * 1024;
    const maxTotalBytes = Math.max(1, maxTotalMb) * 1024 * 1024;
    const maxWireBytes = Math.max(1, maxWireMb) * 1024 * 1024;
    const zips = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".zip")).slice(0, 5);
    if (zips.length === 0) {
      addNotification({ type: "warn", message: "Select one or more .zip files." });
      return;
    }
    const encoded: Array<{ name: string; data_base64: string }> = [];
    let totalBytes = 0;
    for (const f of zips) {
      if (f.size > maxZipBytes) {
        addNotification({
          type: "warn",
          message: `Skipped ${f.name}: exceeds ${maxZipMb}MB per zip limit.`,
        });
        continue;
      }
      if (f.size > maxWireBytes) {
        const possiblePath = (f as any).path || (f as any).webkitRelativePath || "";
        if (possiblePath && !twinZipPath) {
          setTwinZipPath(possiblePath);
          addNotification({
            type: "info",
            message: `${f.name} is large. Switched to server-path mode via zip path.`,
          });
        } else {
          addNotification({
            type: "warn",
            message:
              `${f.name} is too large for browser JSON upload (${maxWireMb}MB wire limit). ` +
              `Use Server zip path mode for very large files (Founder/Admin large-file workflow).`,
          });
        }
        continue;
      }
      if (totalBytes + f.size > maxTotalBytes) {
        addNotification({
          type: "warn",
          message: `Upload limit reached (${maxTotalMb}MB total). Remaining zips skipped.`,
        });
        break;
      }
      try {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        encoded.push({ name: f.name, data_base64: btoa(binary) });
        totalBytes += f.size;
      } catch {
        // skip failed file
      }
    }
    setTwinUploadedZips((prev) => [...prev, ...encoded]);
    addNotification({
      type: "success",
      message: `Twin received ${encoded.length} zip file(s). Tier: ${twinUploadTier}.`,
    });
  };

  const runBackendAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      setBackendOutput(data);
      addNotification({ type: "success", message: "Backend action completed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Backend action failed: ${err?.message || err}` });
    }
  };

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const onBrandAssetUpload = async (
    kind: "logoUrl" | "iconUrl" | "faviconUrl" | "mainChatBackgroundUrl" | "floatingChatBackgroundUrl" | "loginBackgroundUrl",
    files: FileList | null
  ) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addNotification({ type: "error", message: "Please upload an image file." });
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setBrandingDraft((prev) => ({ ...prev, [kind]: dataUrl }));
      addNotification({ type: "success", message: `${kind.replace("Url", "")} selected.` });
    } catch {
      addNotification({ type: "error", message: "Failed to read image." });
    }
  };

  const saveBrandingSettings = () => {
    const next: BrandingConfig = {
      productName: brandingDraft.productName.trim() || defaultBranding.productName,
      logoUrl: brandingDraft.logoUrl || defaultBranding.logoUrl,
      iconUrl: brandingDraft.iconUrl || defaultBranding.iconUrl,
      faviconUrl: brandingDraft.faviconUrl || brandingDraft.iconUrl || defaultBranding.faviconUrl,
      mainChatBackgroundUrl: brandingDraft.mainChatBackgroundUrl || "",
      floatingChatBackgroundUrl: brandingDraft.floatingChatBackgroundUrl || "",
      loginBackgroundUrl: brandingDraft.loginBackgroundUrl || "",
      mainChatOverlayOpacity: Number(brandingDraft.mainChatOverlayOpacity || defaultBranding.mainChatOverlayOpacity),
      floatingOverlayOpacity: Number(brandingDraft.floatingOverlayOpacity || defaultBranding.floatingOverlayOpacity),
      loginOverlayOpacity: Number(brandingDraft.loginOverlayOpacity || defaultBranding.loginOverlayOpacity),
      accentColor: brandingDraft.accentColor || defaultBranding.accentColor,
      glassBlur: Number(brandingDraft.glassBlur || defaultBranding.glassBlur),
    };
    saveBranding(next);
    applyBrandingToDocument(next);
    addNotification({ type: "success", message: "Branding updated across app." });
  };

  const requestServiceRestart = async (service: "kernel" | "ml" | "orchestrator" | "frontend") => {
    if (!confirmSafeAction({ title: `${service} service`, actionLabel: "restart" })) return;
    const reason = window.prompt(`Reason for restarting ${service}:`, "Emergency maintenance");
    if (!reason || reason.trim().length < 8) {
      addNotification({ type: "error", message: "Restart reason is required (min 8 characters)." });
      return;
    }
    const urgencyInput = (window.prompt("Urgency: emergency | high | normal | low", "normal") || "normal").trim().toLowerCase();
    const urgency = ["emergency", "high", "normal", "low"].includes(urgencyInput) ? urgencyInput : "normal";
    try {
      const data = await postJson("/admin/restart", {
        service,
        confirm: true,
        reason: reason.trim(),
        urgency,
      });
      addNotification({
        type: "info",
        message: data?.scheduledAt
          ? `Restart queued for maintenance window (${new Date(data.scheduledAt).toLocaleString()}).`
          : (data?.message || `Restart requested for ${service}`),
      });
    } catch (err: any) {
      addNotification({ type: "error", message: `Restart request failed: ${err?.message || err}` });
    }
  };

  const addDevApiKey = async () => {
    const name = window.prompt("API key name:", "New API Key");
    if (!name) return;
    await callAction("/admin/dashboard/api-keys/create", { name: name.trim() });
    addNotification({ type: "success", message: "API key created." });
  };

  const addWebhook = async () => {
    if (!devWebhook.trim()) {
      addNotification({ type: "error", message: "Enter a webhook URL first." });
      return;
    }
    await callAction("/admin/dashboard/webhooks/upsert", {
      webhook: { url: devWebhook.trim(), event: webhookEvent, active: true },
    });
    addNotification({ type: "success", message: "Webhook added." });
  };

  const testWebhook = async (id: string) => {
    const hook = webhooks.find((w) => w.id === id);
    if (!hook) return;
    await callAction("/admin/dashboard/webhooks/test", { id });
    addNotification({ type: "info", message: `Webhook test sent to ${hook.url}` });
  };

  const addSupportTicket = async () => {
    const subject = newTicket.trim();
    if (!subject) return;
    await callAction("/admin/dashboard/tickets/upsert", {
      ticket: { subject, priority: "medium", status: "open", assignee: "unassigned" },
    });
    setNewTicket("");
    addNotification({ type: "success", message: "Support ticket created." });
  };

  const addAgentProfile = async () => {
    const name = window.prompt("Agent name:", "New Agent");
    if (!name) return;
    await callAction("/admin/dashboard/agents/upsert", {
      agent: {
        name: name.trim(),
        memoryDays: 30,
        tools: ["chat"],
        permission: "workspace",
      },
    });
  };

  const addSavedPrompt = async () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) {
      addNotification({ type: "error", message: "Add prompt title and text." });
      return;
    }
    await callAction("/admin/dashboard/prompts/upsert", {
      prompt: { title: newPromptTitle.trim(), text: newPromptText.trim() },
    });
    setNewPromptTitle("");
    setNewPromptText("");
    addNotification({ type: "success", message: "Prompt saved." });
  };

  const selectedAgent = agentsLocal.find((a) => a.id === selectedAgentId) || null;

  const updateAgent = async (id: string, patch: Partial<AgentProfile>) => {
    const current = agentsLocal.find((a) => a.id === id);
    if (!current) return;
    await callAction("/admin/dashboard/agents/upsert", { agent: { ...current, ...patch, id } });
  };

  const toggleAgentTool = async (id: string, tool: string) => {
    const current = agentsLocal.find((a) => a.id === id);
    if (!current) return;
    const has = current.tools.includes(tool);
    const tools = has ? current.tools.filter((t) => t !== tool) : [...current.tools, tool];
    await callAction("/admin/dashboard/agents/upsert", { agent: { ...current, tools, id } });
  };

  const addDepartment = async () => {
    const name = newDepartmentName.trim();
    const members = Number(newDepartmentMembers);
    const tokens = Number(newDepartmentTokens);
    if (!name || !Number.isFinite(members) || members <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
      addNotification({ type: "error", message: "Enter a valid department, members, and token budget." });
      return;
    }
    await callAction("/admin/dashboard/enterprise/departments/upsert", {
      department: { name, members, tokensPerMonth: tokens },
    });
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
            <button
              style={chip}
              onClick={async () => {
                if (p.active && !confirmSafeAction({ title: `${p.name} plan`, actionLabel: "disable" })) return;
                await callAction("/admin/dashboard/plans/toggle", { id: p.id });
              }}
            >
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
        <button style={primary} onClick={saveModelControl}>Save Model Control</button>
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
      <Card title="Branding Studio (Founder/System Admin)">
        <input
          value={brandingDraft.productName}
          onChange={(e) => setBrandingDraft((p) => ({ ...p, productName: e.target.value }))}
          placeholder="Product name"
          style={input}
        />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={row}>
            <span>Logo</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("logoUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Icon</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("iconUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Favicon</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("faviconUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Main Chat Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("mainChatBackgroundUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Floating Chat Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("floatingChatBackgroundUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Login Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("loginBackgroundUrl", e.target.files)} />
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <img src={brandingDraft.logoUrl || defaultBranding.logoUrl} alt="logo preview" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.iconUrl || defaultBranding.iconUrl} alt="icon preview" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.faviconUrl || defaultBranding.faviconUrl} alt="favicon preview" style={{ width: 20, height: 20, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(148,163,184,0.35)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8 }}>
          <img src={brandingDraft.mainChatBackgroundUrl || defaultBranding.logoUrl} alt="main chat bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.floatingChatBackgroundUrl || defaultBranding.logoUrl} alt="floating bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.loginBackgroundUrl || defaultBranding.logoUrl} alt="login bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Main chat overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.mainChatOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, mainChatOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Floating overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.floatingOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, floatingOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Login overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.loginOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, loginOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Accent color</span>
            <input
              type="color"
              value={brandingDraft.accentColor || "#2563eb"}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, accentColor: e.target.value }))}
              style={{ width: 64, height: 30, padding: 0, border: "none", background: "transparent" }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Glass blur</span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={brandingDraft.glassBlur}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, glassBlur: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
        </div>
        <div style={{ ...log, whiteSpace: "pre-wrap" }}>
          Future options: custom fonts, animated gradients, per-workspace themes, scheduled themes, campaign branding, locale-based branding.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveBrandingSettings}>Save Branding</button>
          <button
            style={chip}
            onClick={() => {
              setBrandingDraft(defaultBranding);
              saveBranding(defaultBranding);
              addNotification({ type: "info", message: "Branding reset to defaults." });
            }}
          >
            Reset Default
          </button>
        </div>
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
      <Card title="Backend Capabilities">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={chip} onClick={() => runBackendAction("GET:/system/status")}>System Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/mesh/nodes")}>Mesh Nodes</button>
          <button style={chip} onClick={() => runBackendAction("GET:/fed/model")}>Federated Model</button>
          <button style={chip} onClick={() => runBackendAction("GET:/doctrine/rules")}>Doctrine Rules</button>
          <button style={chip} onClick={() => runBackendAction("GET:/self-expansion/analyze")}>Self Expansion</button>
          <button style={chip} onClick={() => runBackendAction("GET:/training/samples?limit=20")}>Training Samples</button>
          <button style={chip} onClick={() => runBackendAction("GET:/billing/usage")}>Billing Usage</button>
          <button style={chip} onClick={() => exportOutputTxt("backend_output", backendOutput || "No backend output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("backend_output", backendOutput || "No backend output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Backend Output", backendOutput || "No backend output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setBackendOutput(null)}>Clear Output</button>
        </div>
        <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
          {backendOutput ? JSON.stringify(backendOutput, null, 2) : "No backend output yet."}
        </pre>
      </Card>
      <Card title="Twin Systems">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={chip} onClick={() => runTwinAction("/twin/scan")}>Twin Scan</button>
          <button style={chip} onClick={() => runTwinAction("/twin/analyze")}>Twin Analyze</button>
          <button style={chip} onClick={() => runTwinAction("/twin/evolve", { current_version: "1.0" })}>Twin Evolve</button>
          <button style={chip} onClick={() => runTwinAction("GET:/twin/report")}>Twin Report</button>
          <button style={chip} onClick={() => runTwinAction("/neurotwin/calibrate", { owner: "Joseph Were", tone: "direct", communication_style: "strategic", risk_appetite: "medium", goals: ["Scale NeuroEdge"], writing_samples: [] })}>NeuroTwin Calibrate</button>
          <button style={chip} onClick={() => runTwinAction("GET:/neurotwin/profile")}>NeuroTwin Profile</button>
          <button style={chip} onClick={() => runTwinAction("GET:/neurotwin/report")}>NeuroTwin Report</button>
          <button style={chip} onClick={() => exportOutputTxt("twin_output", twinOutput || "No twin output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("twin_output", twinOutput || "No twin output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Twin Output", twinOutput || "No twin output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setTwinOutput(null)}>Clear Output</button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={twinQuestion}
            onChange={(e) => setTwinQuestion(e.target.value)}
            placeholder="Ask Twin: e.g. which image is used by floating chat and where is it?"
            style={input}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={twinZipPath}
              onChange={(e) => setTwinZipPath(e.target.value)}
              placeholder="Optional server zip path: /home/.../project.zip"
              style={{ ...input, flex: 1, minWidth: 260 }}
            />
            <button style={primary} onClick={askTwin}>Ask Twin</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinIncludeAnalyze}
                onChange={(e) => setTwinIncludeAnalyze(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Include Analyze
            </label>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinIncludeReport}
                onChange={(e) => setTwinIncludeReport(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Include Report
            </label>
            <span style={muted}>
              Tier: {twinUploadTier} • Policy limit:{" "}
              {twinUploadTier === "founder" ? "100GB per zip" : twinUploadTier === "admin" ? "20GB per zip" : twinUploadTier === "paid" ? "5GB per zip" : "default"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={chip}>
              Upload Files
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleTwinUpload(e.target.files)}
              />
            </label>
            <label style={chip}>
              Upload Folder
              <input
                type="file"
                multiple
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore non-standard but supported by Chromium
                webkitdirectory=""
                style={{ display: "none" }}
                onChange={(e) => handleTwinUpload(e.target.files)}
              />
            </label>
            <label style={chip}>
              Upload ZIP
              <input
                type="file"
                multiple
                accept=".zip,application/zip,application/x-zip-compressed"
                style={{ display: "none" }}
                onChange={(e) => handleTwinZipUpload(e.target.files)}
              />
            </label>
            <button
              style={chip}
              onClick={() => {
                setTwinUploadedFiles([]);
                setTwinUploadedZips([]);
              }}
            >
              Clear Uploaded
            </button>
            <span style={muted}>Uploaded files: {twinUploadedFiles.length}</span>
            <span style={muted}>Uploaded zips: {twinUploadedZips.length}</span>
          </div>
        </div>
        <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
          {twinOutput
            ? typeof twinOutput?.answer === "string"
              ? `${twinOutput.answer}\n\n${JSON.stringify(twinOutput, null, 2)}`
              : JSON.stringify(twinOutput, null, 2)
            : "No twin output yet."}
        </pre>
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
                onChange={(e) => callAction("/admin/dashboard/offers/upsert", { offer: { ...o, audience: e.target.value as Offer["audience"] } })}
                style={{ ...input, width: 120 }}
              >
                <option value="all">all</option>
                <option value="new_users">new users</option>
                <option value="enterprise">enterprise</option>
              </select>
              <button
                style={chip}
                onClick={async () => {
                  if (o.active && !confirmSafeAction({ title: `${o.name} offer`, actionLabel: "disable" })) return;
                  await callAction("/admin/dashboard/offers/toggle", { id: o.id });
                }}
              >
                {o.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Content Review Queue">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={chip} onClick={() => setAdminLogs([])}>Clear View</button>
        </div>
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
                onChange={(e) => callAction("/admin/dashboard/tickets/upsert", { ticket: { ...t, status: e.target.value as SupportTicket["status"] } })}
                style={{ ...input, width: 110 }}
              >
                <option value="open">open</option>
                <option value="triaged">triaged</option>
                <option value="resolved">resolved</option>
              </select>
              <button
                style={chip}
                onClick={() =>
                  runGuarded(`ticket ${t.id}`, () => callAction("/admin/dashboard/tickets/delete", { id: t.id }), "close ticket")
                }
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Activity & Reports">
        <Stat label="Logs" value={String(adminLogs.length)} />
        <Stat label="Audit events" value={String(adminAudit.length)} />
        <button style={chip} onClick={() => { setAdminLogs([]); setAdminAudit([]); }}>Clear View</button>
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
              onClick={() => callAction("/admin/dashboard/api-keys/toggle", { id: k.id })}
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
              <button
                style={chip}
                onClick={() =>
                  runGuarded(`webhook ${w.url}`, () => callAction("/admin/dashboard/webhooks/delete", { id: w.id }))
                }
              >
                Delete
              </button>
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
            <button
              style={chip}
              onClick={() => runGuarded(`agent ${a.name}`, () => callAction("/admin/dashboard/agents/delete", { id: a.id }))}
            >
              Delete
            </button>
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
              <button
                style={chip}
                onClick={() => runGuarded(`prompt ${p.title}`, () => callAction("/admin/dashboard/prompts/delete", { id: p.id }))}
              >
                Delete
              </button>
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
                  onBlur={(e) => callAction("/admin/dashboard/enterprise/departments/upsert", { department: { ...d, members: Number(e.target.value) || 1 } })}
                  style={{ ...input, width: 80 }}
                />
                <button
                  style={chip}
                  onClick={() =>
                    runGuarded(`department ${d.name}`, () => callAction("/admin/dashboard/enterprise/departments/delete", { id: d.id }), "remove")
                  }
                >
                  Remove
                </button>
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
        <button style={primary} onClick={() => callAction("/admin/dashboard/enterprise/sso/save", { ssoConfig })}>Save SSO</button>
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

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <button style={{ ...chip, justifySelf: "start" }} onClick={() => setClosed(false)}>
        Reopen: {title}
      </button>
    );
  }

  return (
    <div style={maximized ? { ...card, ...cardMaximized } : card}>
      <div style={cardHeader}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={winBtn} onClick={() => setMinimized((v) => !v)} title={minimized ? "Expand" : "Minimize"}>
            {minimized ? "▢" : "–"}
          </button>
          <button style={winBtn} onClick={() => setMaximized((v) => !v)} title={maximized ? "Restore" : "Maximize"}>
            {maximized ? "❐" : "□"}
          </button>
          <button style={winBtn} onClick={() => setClosed(true)} title="Close">
            ✕
          </button>
        </div>
      </div>
      {!minimized && <div style={{ display: "grid", gap: 8 }}>{children}</div>}
    </div>
  );
};

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
const cardMaximized: React.CSSProperties = {
  position: "fixed",
  top: "6vh",
  left: "4vw",
  width: "92vw",
  height: "88vh",
  zIndex: 1200,
  overflow: "auto",
  backdropFilter: "blur(6px)",
};
const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
  gap: 8,
};
const winBtn: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 7,
  background: "rgba(15,23,42,0.86)",
  color: "#e2e8f0",
  padding: "0.1rem 0.38rem",
  fontSize: "0.75rem",
  cursor: "pointer",
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
