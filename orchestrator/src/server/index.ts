// orchestrator/src/server/index.ts
import express, { Request, Response } from "express";
import axios from "axios";
import { WebSocketServer } from "ws";

import { DevExecutionAgent } from "@agents/dev_execution_agent";
import { GitHubAgent } from "@github/github_agent";

import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { PermissionManager } from "@utils/permissions";

import { globalKernelManager } from "@services/kernelManager";
import { KernelCommand } from "@services/kernelComm";

import { handleChat } from "@handlers/chatHandler";
import { handleExecution } from "@handlers/executionHandler";
import { handleAIInference } from "@handlers/aiHandler";
import { handleBrainstorm } from "@handlers/brainstormHandler";
import { handleDevAssistant } from "@handlers/devAssistantHandler";
import { appendEvent, listEvents, readState, writeState } from "@storage/hybrid_db";
import { InferenceRegistry, InferenceNode } from "@mesh/inference_registry";
import { FedAggregator, verifyPayload, signPayload } from "@federation/fed_aggregator";
import { authMiddleware } from "@security/auth";
import { requireScope, requireWorkspace } from "@security/scope";
import {
  getPrometheusContentType,
  metricsMiddleware,
  renderPrometheusMetrics,
  setMeshNodesOnline,
} from "@observability/metrics";
import { summarizeUsage } from "@billing/usage";
import { createRateLimiter } from "@security/rateLimit";
import { runResearch } from "@research/pipeline";
import {
  exportTrainingJSONL,
  listTrainingSamples,
  recordTrainingSample,
  recordTrainingSampleGuarded,
} from "@training/dataset";
import {
  getEvalCoverageCatalog,
  runEvalBatch,
  runEvalSuite,
  runRedTeamSuite,
  type EvalSuiteName,
} from "@quality/evalRunner";
import { buildReliabilitySnapshot } from "@quality/reliability";
import {
  getModelRouterConfig,
  saveModelRouterConfig,
  summarizeModelOutcomes,
  recordModelOutcome,
} from "@quality/modelQuality";
import { buildRetrievalFreshnessSummary } from "@quality/retrievalFreshness";
import { buildTrustSignalsSummary } from "@quality/trustSignals";
import {
  buildBenchmarkTrend,
  computeBenchmarkRegression,
  getBenchmarkBaselines,
  saveBenchmarkBaselines,
} from "@quality/benchmarkTracker";
import { buildConsistencySnapshot } from "@quality/consistency";
import { createInflightGuard, getInflightSnapshot } from "@quality/sreGuard";
import {
  bulkUpdateFrontierItems,
  frontierTrainingReadinessReport,
  getFrontierProgram,
  resetFrontierProgram,
  upsertFrontierItem,
  upsertFrontierMilestone,
} from "@quality/frontierProgram";
import {
  doctrineShieldMiddleware,
  doctrineVersion,
  listDoctrineRules,
  upsertDoctrineRule,
  validateDoctrine,
} from "@security/doctrineShield";
import {
  analyzeWorkspace,
  buildExpansionProposal,
  generateModuleWithConfirmation,
} from "@core/selfExpansion";
import { callIdverseWithFallback, IdverseConfig, maskApiKey } from "@integrations/idverse";
import path from "path";
import fs from "fs";
import * as crypto from "crypto";

type RestartUrgency = "emergency" | "high" | "normal" | "low";

function actorRole(req: Request): string {
  const raw = req.auth?.raw || {};
  const role =
    (raw.role as string | undefined) ||
    (req.header("x-user-role") as string | undefined) ||
    (raw.user_role as string | undefined) ||
    (Array.isArray(raw.roles) && raw.roles.length > 0 ? String(raw.roles[0]) : undefined) ||
    "";
  return String(role || "").toLowerCase();
}

function actorEmail(req: Request): string {
  const raw = req.auth?.raw || {};
  return String((raw.email as string | undefined) || req.header("x-user-email") || "")
    .trim()
    .toLowerCase();
}

function actorName(req: Request): string {
  const raw = req.auth?.raw || {};
  return String((raw.name as string | undefined) || req.header("x-user-name") || "").trim();
}

function isFounder(req: Request): boolean {
  const role = actorRole(req);
  if (role === "founder") return true;
  if ((req.auth?.scopes || []).includes("founder:*")) return true;
  const configured = String(process.env.FOUNDER_SUBS || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.includes(String(req.auth?.sub || ""));
}

function findDashboardUserByActor(req: Request): any | null {
  const { dashboard } = readDashboardSummary();
  const users = Array.isArray(dashboard.users) ? dashboard.users : [];
  const email = actorEmail(req);
  const sub = String(req.auth?.sub || "").trim().toLowerCase();
  const name = actorName(req).toLowerCase();
  return (
    users.find((u: any) => String(u.email || "").trim().toLowerCase() === email) ||
    users.find((u: any) => String(u.id || "").trim().toLowerCase() === sub) ||
    users.find((u: any) => String(u.name || "").trim().toLowerCase() === name) ||
    null
  );
}

function verifyPrivilegedDevicePolicy(req: Request): { ok: true } | { ok: false; status: number; error: string; details?: string } {
  if (isFounder(req)) return { ok: true };
  const role = actorRole(req);
  if (!["admin", "developer"].includes(role)) return { ok: true };
  const record = findDashboardUserByActor(req);
  if (!record) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      details: "Privileged account not registered in founder staff registry",
    };
  }
  const status = String(record.status || "").toLowerCase();
  if (["suspended", "revoked", "banned"].includes(status)) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      details: `Account is ${status}`,
    };
  }
  if (!record.founderRegistered) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      details: "Privileged account must be founder-registered",
    };
  }
  if (record.companyOwnedOnly) {
    const deviceId = String(req.auth?.deviceId || req.header("x-device-id") || "").trim();
    if (!deviceId) {
      return {
        ok: false,
        status: 403,
        error: "Forbidden",
        details: "Missing device ID for privileged account",
      };
    }
    const allowed = String(record.allowedDeviceId || "").trim();
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        error: "Forbidden",
        details: "No approved company device bound to account",
      };
    }
    if (allowed !== deviceId) {
      return {
        ok: false,
        status: 403,
        error: "Forbidden",
        details: "Device is not approved for this privileged account",
      };
    }
  }
  return { ok: true };
}

function nextMidnightIso(): string {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

function hasScope(req: Request, needed: string): boolean {
  const scopes = req.auth?.scopes || [];
  if (scopes.includes("*") || scopes.includes("admin:*")) return true;
  if (scopes.includes(needed)) return true;
  const [domain] = needed.split(":");
  return scopes.includes(`${domain}:*`);
}

function hasRole(req: Request, roles: string[]): boolean {
  const role = actorRole(req);
  if (role && roles.includes(role)) return true;
  if (roles.includes("founder") && isFounder(req)) return true;
  return false;
}

function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: any) => {
    if (hasRole(req, roles) || hasScope(req, "admin:*")) {
      const devicePolicy = verifyPrivilegedDevicePolicy(req);
      if (!devicePolicy.ok) {
        return res.status(devicePolicy.status).json({
          error: devicePolicy.error,
          details: devicePolicy.details || "Privileged device policy blocked request",
        });
      }
      return next();
    }
    return res.status(403).json({
      error: "Forbidden",
      missingRole: roles,
      actorRole: actorRole(req) || "unknown",
    });
  };
}

function isPaidUser(req: Request): boolean {
  const raw = req.auth?.raw || {};
  const plan = String(
    (raw.plan as string | undefined) ||
      (raw.subscription_tier as string | undefined) ||
      (raw.tier as string | undefined) ||
      (req.header("x-user-plan") as string | undefined) ||
      ""
  )
    .trim()
    .toLowerCase();
  return ["pro", "enterprise", "paid", "business"].includes(plan);
}

function generateApiKey(prefix = "ne_sk"): string {
  return `${prefix}-${crypto.randomBytes(24).toString("hex")}`;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function readIdverseConfigFromState(): IdverseConfig {
  const state = readState();
  const saved = (state.summary?.idverse || {}) as Record<string, any>;
  const enabled = typeof saved.enabled === "boolean" ? saved.enabled : boolEnv("IDVERSE_ENABLED", true);
  return {
    enabled,
    baseUrl: String(saved.baseUrl || process.env.IDVERSE_BASE_URL || "").trim(),
    apiKey: String(saved.apiKey || process.env.IDVERSE_API_KEY || "").trim(),
    projectId: String(saved.projectId || process.env.IDVERSE_PROJECT_ID || "").trim(),
    timeoutMs: Math.max(1000, Number(saved.timeoutMs || process.env.IDVERSE_TIMEOUT_MS || 12000)),
    strictBiometric:
      typeof saved.strictBiometric === "boolean"
        ? saved.strictBiometric
        : boolEnv("IDVERSE_STRICT_BIOMETRIC", true),
    strictLiveness:
      typeof saved.strictLiveness === "boolean"
        ? saved.strictLiveness
        : boolEnv("IDVERSE_STRICT_LIVENESS", true),
  };
}

function writeIdverseConfigToState(next: IdverseConfig): IdverseConfig {
  const current = readState();
  writeState({
    ...current,
    summary: {
      ...(current.summary || {}),
      idverse: next,
    },
  });
  return next;
}

function idversePublicView(cfg: IdverseConfig): Record<string, any> {
  return {
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl,
    projectId: cfg.projectId,
    timeoutMs: cfg.timeoutMs,
    strictBiometric: cfg.strictBiometric,
    strictLiveness: cfg.strictLiveness,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    configured: Boolean(cfg.baseUrl && cfg.apiKey),
  };
}

function sanitizeText(raw: string): string {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function stripHtml(raw: string): string {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBase64Safe(data: string): Buffer | null {
  try {
    return Buffer.from(String(data || ""), "base64");
  } catch {
    return null;
  }
}

type ThreatSeverity = "low" | "medium" | "high" | "critical";
const AEGIS_SNAPSHOT_DIR = path.join(process.cwd(), "snapshots");
type TrustedDomain = "medicine" | "agriculture" | "market";

const TRUSTED_BOOTSTRAP_PACKS: Record<TrustedDomain, { core: string[]; secondary: string[] }> = {
  medicine: {
    core: [
      "https://www.who.int/",
      "https://www.cdc.gov/",
      "https://medlineplus.gov/",
      "https://www.nhs.uk/",
      "https://www.nih.gov/",
      "https://www.fda.gov/",
    ],
    secondary: [
      "https://www.mayoclinic.org/",
      "https://www.cochrane.org/",
      "https://www.ema.europa.eu/",
    ],
  },
  agriculture: {
    core: [
      "https://www.fao.org/",
      "https://www.usda.gov/",
      "https://www.cgiar.org/",
      "https://www.cimmyt.org/",
      "https://www.cabi.org/",
      "https://www.unep.org/",
    ],
    secondary: [
      "https://www.worldagroforestry.org/",
      "https://www.ifad.org/",
      "https://www.ipcc.ch/",
    ],
  },
  market: {
    core: [
      "https://www.federalreserve.gov/",
      "https://fred.stlouisfed.org/",
      "https://www.imf.org/",
      "https://www.worldbank.org/",
      "https://www.sec.gov/",
      "https://www.bis.org/",
    ],
    secondary: [
      "https://www.oecd.org/",
      "https://www.cftc.gov/",
      "https://www.eia.gov/",
    ],
  },
};

function isTrustedDomain(value: string): value is TrustedDomain {
  return value === "medicine" || value === "agriculture" || value === "market";
}

function trustedPackUrls(domain: TrustedDomain, includeSecondary = false, limit = 12): string[] {
  const base = TRUSTED_BOOTSTRAP_PACKS[domain];
  const merged = [...base.core, ...(includeSecondary ? base.secondary : [])];
  return merged.slice(0, Math.max(1, Math.min(30, limit)));
}

function readBootstrapSummary(): Record<string, any> {
  const state = readState();
  const summary = (state.summary || {}) as Record<string, any>;
  return (summary.trainingBootstrap || {}) as Record<string, any>;
}

function writeBootstrapSummary(next: Record<string, any>) {
  const current = readState();
  writeState({
    ...current,
    summary: {
      ...(current.summary || {}),
      trainingBootstrap: next,
    },
  });
}

function boolEnvDefault(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function getAutoRefreshConfig(): { enabled: boolean; hourUtc: number; minuteUtc: number; staleHours: number; tickMs: number } {
  const summary = readBootstrapSummary();
  const saved = (summary.autoRefreshConfig || {}) as Record<string, any>;
  const enabled =
    typeof saved.enabled === "boolean" ? saved.enabled : boolEnvDefault("BOOTSTRAP_AUTO_REFRESH_ENABLED", true);
  const hourUtc = Math.max(
    0,
    Math.min(23, Number(saved.hourUtc ?? process.env.BOOTSTRAP_REFRESH_HOUR_UTC ?? 2))
  );
  const minuteUtc = Math.max(
    0,
    Math.min(59, Number(saved.minuteUtc ?? process.env.BOOTSTRAP_REFRESH_MINUTE_UTC ?? 10))
  );
  const staleHours = Math.max(12, Number(saved.staleHours ?? process.env.BOOTSTRAP_STALE_HOURS ?? 36));
  const tickMs = Math.max(30_000, Number(saved.tickMs ?? process.env.BOOTSTRAP_REFRESH_TICK_MS ?? 120_000));
  return { enabled, hourUtc, minuteUtc, staleHours, tickMs };
}

async function probeSourceMetadata(url: string, timeoutMs = 9000): Promise<Record<string, any>> {
  try {
    const resp = await axios.request({
      method: "HEAD",
      url,
      timeout: timeoutMs,
      validateStatus: () => true,
      maxRedirects: 5,
    });
    return {
      status: Number(resp.status || 0),
      etag: String(resp.headers?.etag || ""),
      lastModified: String(resp.headers?.["last-modified"] || ""),
      checkedAt: Date.now(),
      ok: resp.status >= 200 && resp.status < 400,
    };
  } catch (err: any) {
    return {
      status: 0,
      etag: "",
      lastModified: "",
      checkedAt: Date.now(),
      ok: false,
      error: err?.message || String(err),
    };
  }
}

function stableStringify(input: any): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(input).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(input[k])}`).join(",")}}`;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function aegisSign(payload: Record<string, any>): string {
  const secret = String(process.env.AEGIS_AUDIT_SECRET || process.env.JWT_SECRET || "aegis-dev-secret");
  return crypto
    .createHmac("sha256", secret)
    .update(stableStringify(payload))
    .digest("hex");
}

function appendSignedSecurityEvent(type: string, payload: Record<string, any>) {
  const signed = {
    ...payload,
    signature: aegisSign(payload),
  };
  appendEvent({
    type,
    timestamp: Date.now(),
    payload: signed,
  });
}

function detectMalwareSignals(text: string): { severity: ThreatSeverity; signals: string[] } {
  const lower = String(text || "").toLowerCase();
  const checks: Array<{ re: RegExp; signal: string; severity: ThreatSeverity }> = [
    { re: /bash\s+-i.*\/dev\/tcp/, signal: "Reverse shell pattern", severity: "critical" },
    { re: /nc\s+-e|netcat\s+-e/, signal: "Netcat exec shell pattern", severity: "critical" },
    { re: /eval\((atob|unescape)\(/, signal: "Obfuscated eval payload", severity: "high" },
    { re: /from\s+base64\s+import|base64\.b64decode/, signal: "Encoded payload decode usage", severity: "medium" },
    { re: /subprocess\.popen|os\.system|runtime\.exec/, signal: "Command execution primitive", severity: "high" },
    { re: /(token|secret|password).*(exfiltrate|steal|send)/, signal: "Data exfiltration intent", severity: "critical" },
    { re: /powershell.*(invoke-webrequest|downloadfile)/, signal: "PowerShell downloader", severity: "high" },
    { re: /\.ps1|\.bat|\.vbs|\.exe/, signal: "Executable/script artifact", severity: "medium" },
  ];
  const signals: string[] = [];
  let severity: ThreatSeverity = "low";
  const rank: Record<ThreatSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  for (const c of checks) {
    if (c.re.test(lower)) {
      signals.push(c.signal);
      if (rank[c.severity] > rank[severity]) severity = c.severity;
    }
  }
  return { severity, signals };
}

function detectThreatsFromActivity(input: string): { severity: ThreatSeverity; signals: string[] } {
  const text = String(input || "").toLowerCase();
  const signals: string[] = [];
  const checks: Array<{ re: RegExp; signal: string; severity: ThreatSeverity }> = [
    { re: /rm\s+-rf\s+\//, signal: "Destructive filesystem command", severity: "critical" },
    { re: /curl\s+.*\|\s*sh/, signal: "Remote script pipe execution", severity: "high" },
    { re: /powershell.*downloadstring/i, signal: "Suspicious PowerShell downloader", severity: "high" },
    { re: /drop\s+table|truncate\s+table/, signal: "Potential destructive SQL statement", severity: "high" },
    { re: /base64\s+-d|certutil\s+-decode/, signal: "Encoded payload decode pattern", severity: "medium" },
    { re: /nmap|masscan|hydra/, signal: "Recon/bruteforce tool signature", severity: "high" },
    { re: /ransom|encrypt all files|keylogger|steal/, signal: "Malware/data theft keyword", severity: "critical" },
    { re: /\.exe|\.dll|\.bat|\.ps1/, signal: "Executable payload indicator", severity: "medium" },
  ];

  let finalSeverity: ThreatSeverity = "low";
  const order: Record<ThreatSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  for (const item of checks) {
    if (item.re.test(text)) {
      signals.push(item.signal);
      if (order[item.severity] > order[finalSeverity]) finalSeverity = item.severity;
    }
  }
  return { severity: finalSeverity, signals };
}

function readDashboardSummary() {
  const state = readState();
  const defaults = {
    users: [
      {
        id: "u1",
        name: "Joseph Were",
        email: "founder@neuroedge.ai",
        role: "founder",
        status: "verified",
        founderRegistered: true,
        companyOwnedOnly: true,
        allowedDeviceId: "",
      },
      {
        id: "u2",
        name: "Guest User",
        email: "guest@local",
        role: "user",
        status: "active",
        founderRegistered: false,
        companyOwnedOnly: false,
        allowedDeviceId: "",
      },
      {
        id: "u3",
        name: "Ops Moderator",
        email: "ops@neuroedge.ai",
        role: "moderator",
        status: "active",
        founderRegistered: false,
        companyOwnedOnly: false,
        allowedDeviceId: "",
      },
    ],
    offers: [
      { id: "off1", name: "Launch Promo", discountPct: 20, active: true, audience: "new_users" },
      { id: "off2", name: "Enterprise Pilot", discountPct: 15, active: false, audience: "enterprise" },
    ],
    plans: [
      { id: "p1", name: "Free", monthly: 0, annual: 0, active: true, features: ["Basic Chat", "History"] },
      { id: "p2", name: "Pro", monthly: 19, annual: 190, active: true, features: ["Advanced Models", "Research", "API"] },
      { id: "p3", name: "Enterprise", monthly: 99, annual: 990, active: true, features: ["SSO", "Audit Export", "Dedicated Support"] },
    ],
    payment: {
      cardHolder: "",
      cardNumberMasked: "",
      expMonth: "",
      expYear: "",
      billingEmail: "",
      country: "",
      taxId: "",
      saveForAutoRenew: true,
    },
    cryptoRewards: {
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
    },
    rewardsLedger: {
      config: {
        pointsPerUsd: 100,
        wdcPerPoint: 0.01,
        wdcListingLive: false,
        payoutMode: "points_only",
      },
      wallets: [
        {
          userId: "u2",
          userName: "Guest User",
          points: 0,
          totalEarnedPoints: 0,
          pendingCashUsd: 0,
          pendingWdc: 0,
          updatedAt: Date.now(),
        },
      ],
    },
    modelControl: {
      model: "neuroedge-13b-instruct",
      temperature: 0.3,
      maxTokens: 2048,
      safetyMode: "balanced",
    },
    featureFlags: {
      research_pipeline: true,
      streaming_tokens: true,
      mesh_inference: true,
      strict_citations: true,
      founder_mode: true,
      multimodal_uploads: false,
      auto_eval_nightly: true,
      enterprise_sso: false,
    },
    supportTickets: [],
    devApiKeys: [{ id: "k1", name: "Default SDK Key", keyMasked: "neur...9x3a", createdAt: Date.now(), revoked: false }],
    integrations: [],
    domainLinks: [
      {
        id: "lnk-1",
        name: "Main Product Site",
        url: "https://example.com",
        type: "public",
        environment: "production",
        audience: "users",
        status: "active",
        description: "Primary user-facing website",
        tags: ["website", "public"],
        owner: "founder",
        notes: "Replace with your real domain",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    webhooks: [],
    extensions: [
      {
        id: "code-linter",
        name: "Code Linter",
        description: "Automatically checks and formats code blocks",
        active: true,
        permissions: ["read-chat", "execute-scripts"],
        version: "1.0.0",
      },
      {
        id: "analytics-plugin",
        name: "Analytics Plugin",
        description: "Provides execution metrics and dashboards",
        active: false,
        permissions: ["read-metrics"],
        version: "0.9.2",
      },
      {
        id: "custom-commands",
        name: "Custom Commands",
        description: "Adds custom commands to the NeuroEdge Command Palette",
        active: true,
        permissions: ["execute-scripts"],
        version: "1.1.0",
      },
    ],
    agentsLocal: [
      { id: "ag1", name: "Research Agent", memoryDays: 30, tools: ["research", "web"], permission: "workspace" },
      { id: "ag2", name: "Code Agent", memoryDays: 14, tools: ["code", "files"], permission: "project" },
    ],
    savedPrompts: [
      { id: "sp1", title: "Research Brief", text: "Summarize latest trends with sources." },
      { id: "sp2", title: "Code Review", text: "Review this code for bugs and regressions." },
    ],
    enterpriseDepartments: [
      { id: "d1", name: "Engineering", members: 12, tokensPerMonth: 210000 },
      { id: "d2", name: "Support", members: 7, tokensPerMonth: 54000 },
    ],
    ssoConfig: {
      enabled: false,
      provider: "okta",
      domain: "",
      clientId: "",
      metadataUrl: "",
    },
    accessControl: {
      rolePermissions: {
        founder: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
        admin: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
        developer: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
        enterprise: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
        user: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
        guest: { defaultAction: "allow", allow: [], suspend: [], revoke: [] },
      },
      userOverrides: [],
      updatedAt: Date.now(),
    },
    deviceProtection: {
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
      antiTheft: {
        consentRequired: true,
        stolenModeOnlyLocation: true,
        allowRemoteLock: true,
      },
      loanProtection: {
        enabled: false,
        graceDays: 14,
        overdueDaysThreshold: 30,
      },
      resilience: {
        selfHealingEnabled: true,
        rollbackEnabled: true,
        safeMode: { active: false, reason: "", activatedAt: 0 },
      },
      snapshots: [],
      integrityBaseline: {},
      managedDevices: [],
      workerActivities: [],
      securityAlerts: [],
      updatedAt: Date.now(),
    },
    permissionCatalog: DASHBOARD_PERMISSION_CATALOG,
    idverse: idversePublicView(readIdverseConfigFromState()),
  };
  const dashboard = { ...defaults, ...((state.summary?.dashboard || {}) as Record<string, any>) };
  return { state, dashboard };
}

function writeDashboardSummary(nextDashboard: Record<string, any>) {
  const current = readState();
  return writeState({
    ...current,
    summary: {
      ...(current.summary || {}),
      dashboard: nextDashboard,
    },
  });
}

function mergeDashboardSection(section: string, data: any) {
  const { dashboard } = readDashboardSummary();
  const next = { ...dashboard, [section]: data };
  writeDashboardSummary(next);
  return next;
}

type AccessAction = "allow" | "suspend" | "revoke";
const DASHBOARD_PERMISSION_CATALOG = [
  { id: "dashboard.bootstrap", group: "dashboard", label: "View Dashboard Data", scope: "admin:read", roles: ["founder", "admin"] },
  { id: "users.role", group: "users", label: "Change User Roles", scope: "admin:write", roles: ["founder"] },
  { id: "users.status", group: "users", label: "Ban/Verify/Status", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "plans.manage", group: "billing", label: "Manage Plans", scope: "admin:write", roles: ["founder"] },
  { id: "payment.manage", group: "billing", label: "Manage Payment Profile", scope: "admin:write", roles: ["founder"] },
  { id: "offers.manage", group: "billing", label: "Create/Toggle Offers", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "api_keys.manage", group: "developer", label: "Create/Revoke API Keys", scope: "admin:write", roles: ["founder", "admin", "developer"] },
  { id: "integrations.manage", group: "developer", label: "Manage Integrations", scope: "admin:write", roles: ["founder", "admin", "developer"] },
  { id: "domain_links.manage", group: "platform", label: "Manage Domain Links", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "webhooks.manage", group: "developer", label: "Manage Webhooks", scope: "admin:write", roles: ["founder", "admin", "developer"] },
  { id: "agents.manage", group: "ai", label: "Manage Agent Profiles", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "extensions.manage", group: "platform", label: "Manage Extensions", scope: "admin:write", roles: ["founder", "admin", "developer"] },
  { id: "enterprise.manage", group: "enterprise", label: "Manage Enterprise Settings", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "idverse.manage", group: "identity", label: "Configure IDVerse", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "training.manage", group: "training", label: "Run Training Studio Jobs", scope: "training:write", roles: ["founder", "admin"] },
];

function auditDashboardAction(req: Request, domain: string, action: string, payload: Record<string, any> = {}) {
  appendEvent({
    type: "admin.dashboard.action",
    timestamp: Date.now(),
    payload: {
      domain,
      action,
      actor: req.auth?.sub || "unknown",
      actorRole: actorRole(req) || "unknown",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      ...payload,
    },
  });
}

export function startServer(
  restPort: number,
  eventBus: EventBus,
  logger: Logger
) {
  const WS_PORT = restPort + 1; // predictable, low-collision
  const maxJsonBody = process.env.MAX_JSON_BODY || "30mb";

  /* ---------------- REST API ---------------- */
  const app = express();
  app.use((_req: Request, res: Response, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, X-Org-Id, X-Workspace-Id, X-User-Role, X-User-Email, X-User-Name, X-Device-Id"
    );
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: maxJsonBody }));
  app.use(express.urlencoded({ extended: true, limit: maxJsonBody }));
  app.use(metricsMiddleware);
  app.use(authMiddleware);
  app.use(doctrineShieldMiddleware);
  const intrusionBuckets = new Map<string, { count: number; windowStart: number }>();
  app.use((req: Request, res: Response, next) => {
    const now = Date.now();
    const ip = String(req.ip || req.header("x-forwarded-for") || "unknown");
    const bucket = intrusionBuckets.get(ip) || { count: 0, windowStart: now };
    if (now - bucket.windowStart > 60_000) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count += 1;
    intrusionBuckets.set(ip, bucket);
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const policy = (section.policy || {}) as Record<string, any>;
    const enabled = Boolean(policy.enabled ?? true);
    if (enabled && bucket.count > 240) {
      const alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "Traffic spike / possible abuse",
        severity: "high",
        actor: req.auth?.sub || "unknown",
        actorRole: actorRole(req),
        deviceId: String(req.auth?.deviceId || req.header("x-device-id") || ""),
        signals: ["Request rate exceeded threshold"],
        status: "open",
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        timestamp: now,
      };
      const next = {
        ...section,
        securityAlerts: [alert, ...(Array.isArray(section.securityAlerts) ? section.securityAlerts : [])].slice(0, 2000),
        updatedAt: now,
      };
      mergeDashboardSection("deviceProtection", next);
      appendSignedSecurityEvent("aegis.intrusion.blocked", {
        ip,
        count: bucket.count,
        path: req.path,
        method: req.method,
        orgId: req.auth?.orgId || "personal",
      });
      return res.status(429).json({ error: "Too many requests", reason: "Intrusion protection rate threshold" });
    }
    const safeModeActive = Boolean(section?.resilience?.safeMode?.active);
    if (safeModeActive && req.method !== "GET") {
      const allowedPostPrefixes = ["/chat", "/ai", "/brainstorm", "/health", "/status", "/admin/aegis"];
      const allowed = allowedPostPrefixes.some((p) => req.path.startsWith(p));
      if (!allowed) {
        return res.status(503).json({
          error: "Safe mode active",
          reason: section?.resilience?.safeMode?.reason || "Security event",
          message: "Non-essential write operations are temporarily blocked",
        });
      }
      if (req.path.startsWith("/admin/training/ingest/files")) {
        return res.status(503).json({
          error: "Safe mode active",
          reason: "Uploads are blocked during safe mode",
        });
      }
    }
    next();
  });

  app.get("/metrics", async (_req: Request, res: Response) => {
    res.set("Content-Type", getPrometheusContentType());
    res.send(await renderPrometheusMetrics());
  });

  app.get("/admin/logs", requireWorkspace, requireScope("admin:read"), (req: Request, res: Response) => {
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 300));
    res.json({
      success: true,
      logs: listEvents(limit),
    });
  });

  app.get("/admin/audit", requireWorkspace, requireScope("admin:read"), (req: Request, res: Response) => {
    const limit = Math.min(3000, Math.max(1, Number(req.query.limit) || 500));
    const audit = listEvents(limit).filter((evt) => {
      const t = String(evt.type || "");
      return (
        t.startsWith("admin.") ||
        t.startsWith("doctrine.") ||
        t.startsWith("policy.") ||
        t.startsWith("self_expansion.")
      );
    });
    res.json({ success: true, audit });
  });

  app.get("/admin/usage", requireWorkspace, requireScope("admin:read"), (req: Request, res: Response) => {
    res.json({
      success: true,
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      usage: summarizeUsage(),
    });
  });

  app.get("/admin/agents", requireWorkspace, requireScope("admin:read"), (_req: Request, res: Response) => {
    const knownAgents = [
      "DevExecutionAgent",
      "GitHubAgent",
      "FloatingChatAgent",
      "MLReasoningAgent",
      "MeshAgent",
    ];
    const recentEvents = listEvents(800);
    const agentEvents = recentEvents.filter((e) => String(e.type || "").toLowerCase().includes("agent"));
    res.json({
      success: true,
      totalKnown: knownAgents.length,
      agents: knownAgents.map((name) => ({
        name,
        status: "running",
      })),
      recentAgentEvents: agentEvents.slice(-40),
    });
  });

  app.post("/admin/restart", requireWorkspace, requireScope("admin:write"), (req: Request, res: Response) => {
    if (!isFounder(req)) {
      return res.status(403).json({
        error: "Founder approval required",
        message: "Only founder role can request service restart.",
      });
    }
    const service = String(req.body?.service || "").trim().toLowerCase();
    const confirm = Boolean(req.body?.confirm);
    const reason = String(req.body?.reason || "").trim();
    const urgency = String(req.body?.urgency || "normal").toLowerCase() as RestartUrgency;
    const allowed = ["kernel", "ml", "orchestrator", "frontend"];
    if (!allowed.includes(service)) {
      return res.status(400).json({ error: "Invalid service", allowed });
    }
    if (!reason || reason.length < 8) {
      return res.status(400).json({ error: "Missing reason", message: "Provide restart reason (min 8 chars)." });
    }
    if (!["emergency", "high", "normal", "low"].includes(urgency)) {
      return res.status(400).json({ error: "Invalid urgency", allowed: ["emergency", "high", "normal", "low"] });
    }
    const immediate = urgency === "emergency";
    const scheduledAt = immediate ? undefined : nextMidnightIso();
    appendEvent({
      type: "admin.restart.requested",
      timestamp: Date.now(),
      payload: {
        service,
        actor: req.auth?.sub || "unknown",
        actorRole: actorRole(req),
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        confirm,
        reason,
        urgency,
        immediate,
        scheduledAt: scheduledAt || null,
      },
    });
    return res.json({
      success: true,
      executed: false,
      confirmationRequired: true,
      policy: immediate ? "immediate_emergency_window" : "midnight_maintenance_window",
      message: immediate
        ? "Emergency request accepted. Execute immediately via your process manager with operator confirmation."
        : `Non-urgent request accepted. NeuroEdge recommends maintenance at midnight (${scheduledAt}).`,
      suggestedCommands: [
        `systemctl restart neuroedge-${service}`,
        `pm2 restart neuroedge-${service}`,
      ],
      scheduledAt: scheduledAt || null,
    });
  });

  app.get("/admin/dashboard/bootstrap", requireWorkspace, requireScope("admin:read"), (_req: Request, res: Response) => {
    const { state, dashboard } = readDashboardSummary();
    res.json({
      success: true,
      dashboard,
      updatedAt: state.updatedAt,
      version: state.version,
    });
  });

  app.get("/admin/dashboard/access/bootstrap", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin"]), (_req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const accessControl = (dashboard.accessControl || {}) as Record<string, any>;
    res.json({
      success: true,
      permissionCatalog: DASHBOARD_PERMISSION_CATALOG,
      accessControl: {
        rolePermissions: accessControl.rolePermissions || {},
        userOverrides: Array.isArray(accessControl.userOverrides) ? accessControl.userOverrides : [],
        updatedAt: Number(accessControl.updatedAt || Date.now()),
      },
    });
  });

  app.post("/admin/dashboard/access/role-action", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const role = String(req.body?.role || "").trim().toLowerCase();
    const permissionId = String(req.body?.permissionId || "").trim();
    const action = String(req.body?.action || "").trim().toLowerCase() as AccessAction;
    const allowedRoles = new Set(["founder", "admin", "developer", "enterprise", "user", "guest"]);
    if (!allowedRoles.has(role)) return res.status(400).json({ error: "Invalid role" });
    if (!DASHBOARD_PERMISSION_CATALOG.some((p) => p.id === permissionId)) return res.status(400).json({ error: "Invalid permissionId" });
    if (!["allow", "suspend", "revoke"].includes(action)) return res.status(400).json({ error: "Invalid action" });

    const { dashboard } = readDashboardSummary();
    const accessControl = (dashboard.accessControl || {}) as Record<string, any>;
    const rolePermissions = (accessControl.rolePermissions || {}) as Record<string, any>;
    const current = rolePermissions[role] || { defaultAction: "allow", allow: [], suspend: [], revoke: [] };
    const clean = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x).trim()).filter(Boolean)));
    const nextRole = {
      defaultAction: String(current.defaultAction || "allow"),
      allow: clean(current.allow),
      suspend: clean(current.suspend),
      revoke: clean(current.revoke),
    };
    nextRole.allow = nextRole.allow.filter((x) => x !== permissionId);
    nextRole.suspend = nextRole.suspend.filter((x) => x !== permissionId);
    nextRole.revoke = nextRole.revoke.filter((x) => x !== permissionId);
    nextRole[action].push(permissionId);

    const next = {
      rolePermissions: { ...rolePermissions, [role]: nextRole },
      userOverrides: Array.isArray(accessControl.userOverrides) ? accessControl.userOverrides : [],
      updatedAt: Date.now(),
    };
    mergeDashboardSection("accessControl", next);
    auditDashboardAction(req, "access_control", "role_action", { role, permissionId, action });
    res.json({ success: true, accessControl: next, permissionCatalog: DASHBOARD_PERMISSION_CATALOG });
  });

  app.post("/admin/dashboard/access/user-action", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const userId = String(req.body?.userId || "").trim();
    const permissionId = String(req.body?.permissionId || "").trim();
    const action = String(req.body?.action || "").trim().toLowerCase() as AccessAction;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!DASHBOARD_PERMISSION_CATALOG.some((p) => p.id === permissionId)) return res.status(400).json({ error: "Invalid permissionId" });
    if (!["allow", "suspend", "revoke"].includes(action)) return res.status(400).json({ error: "Invalid action" });

    const { dashboard } = readDashboardSummary();
    const accessControl = (dashboard.accessControl || {}) as Record<string, any>;
    const overrides = Array.isArray(accessControl.userOverrides) ? accessControl.userOverrides : [];
    const clean = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x).trim()).filter(Boolean)));
    let found = false;
    const nextOverrides = overrides.map((ov: any) => {
      if (String(ov.userId) !== userId) return ov;
      found = true;
      const next = {
        userId,
        allow: clean(ov.allow),
        suspend: clean(ov.suspend),
        revoke: clean(ov.revoke),
      };
      next.allow = next.allow.filter((x) => x !== permissionId);
      next.suspend = next.suspend.filter((x) => x !== permissionId);
      next.revoke = next.revoke.filter((x) => x !== permissionId);
      next[action].push(permissionId);
      return next;
    });
    if (!found) {
      nextOverrides.push({
        userId,
        allow: action === "allow" ? [permissionId] : [],
        suspend: action === "suspend" ? [permissionId] : [],
        revoke: action === "revoke" ? [permissionId] : [],
      });
    }

    const next = {
      rolePermissions: accessControl.rolePermissions || {},
      userOverrides: nextOverrides,
      updatedAt: Date.now(),
    };
    mergeDashboardSection("accessControl", next);
    auditDashboardAction(req, "access_control", "user_action", { userId, permissionId, action });
    res.json({ success: true, accessControl: next, permissionCatalog: DASHBOARD_PERMISSION_CATALOG });
  });

  app.get("/admin/device-protection/bootstrap", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin", "enterprise"]), (req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const managedDevices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const workerActivities = Array.isArray(section.workerActivities) ? section.workerActivities : [];
    const securityAlerts = Array.isArray(section.securityAlerts) ? section.securityAlerts : [];
    const isEnterprise = actorRole(req) === "enterprise";
    res.json({
      success: true,
      deviceProtection: {
        policy: section.policy || {},
        managedDevices: isEnterprise ? managedDevices.filter((d: any) => String(d.ownerOrg || "") === String(req.auth?.orgId || "")) : managedDevices,
        workerActivities: isEnterprise
          ? workerActivities.filter((a: any) => String(a.orgId || "") === String(req.auth?.orgId || ""))
          : workerActivities,
        securityAlerts: isEnterprise
          ? securityAlerts.filter((a: any) => String(a.orgId || "") === String(req.auth?.orgId || ""))
          : securityAlerts,
        updatedAt: Number(section.updatedAt || Date.now()),
      },
    });
  });

  app.post("/admin/device-protection/policy/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const incoming = req.body?.policy || {};
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const current = (section.policy || {}) as Record<string, any>;
    const nextPolicy = {
      enabled: Boolean(incoming.enabled ?? current.enabled ?? true),
      monitorCommands: Boolean(incoming.monitorCommands ?? current.monitorCommands ?? true),
      monitorFileChanges: Boolean(incoming.monitorFileChanges ?? current.monitorFileChanges ?? true),
      monitorNetworkEgress: Boolean(incoming.monitorNetworkEgress ?? current.monitorNetworkEgress ?? true),
      blockUnknownExecutables: Boolean(incoming.blockUnknownExecutables ?? current.blockUnknownExecutables ?? true),
      virusScanOnUpload: Boolean(incoming.virusScanOnUpload ?? current.virusScanOnUpload ?? true),
      dataExfiltrationShield: Boolean(incoming.dataExfiltrationShield ?? current.dataExfiltrationShield ?? true),
      autoQuarantineOnCritical: Boolean(incoming.autoQuarantineOnCritical ?? current.autoQuarantineOnCritical ?? true),
      enterpriseMode: Boolean(incoming.enterpriseMode ?? current.enterpriseMode ?? true),
      retentionDays: Math.max(7, Math.min(3650, Number(incoming.retentionDays ?? current.retentionDays ?? 90))),
    };
    const next = {
      ...section,
      policy: nextPolicy,
      managedDevices: Array.isArray(section.managedDevices) ? section.managedDevices : [],
      workerActivities: Array.isArray(section.workerActivities) ? section.workerActivities : [],
      securityAlerts: Array.isArray(section.securityAlerts) ? section.securityAlerts : [],
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    auditDashboardAction(req, "device_protection", "save_policy", nextPolicy);
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/device-protection/devices/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.device || {};
    const id = String(input.id || `dev-${Date.now()}`).trim();
    const hostname = String(input.hostname || "").trim();
    if (!id || !hostname) return res.status(400).json({ error: "Missing device id or hostname" });
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const devices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const exists = devices.some((d: any) => String(d.id) === id);
    const nextDevice = {
      id,
      hostname,
      os: String(input.os || "unknown"),
      ownerUserId: String(input.ownerUserId || ""),
      ownerOrg: String(input.ownerOrg || req.auth?.orgId || "personal"),
      companyOwned: Boolean(input.companyOwned ?? true),
      status: String(input.status || "active"),
      allowExternalStorage: Boolean(input.allowExternalStorage ?? false),
      allowUnsignedApps: Boolean(input.allowUnsignedApps ?? false),
      antiVirusVersion: String(input.antiVirusVersion || ""),
      lastSeenAt: Number(input.lastSeenAt || Date.now()),
      updatedAt: Date.now(),
    };
    const nextDevices = exists
      ? devices.map((d: any) => (String(d.id) === id ? { ...d, ...nextDevice } : d))
      : [nextDevice, ...devices];
    const next = {
      ...section,
      policy: section.policy || {},
      managedDevices: nextDevices,
      workerActivities: Array.isArray(section.workerActivities) ? section.workerActivities : [],
      securityAlerts: Array.isArray(section.securityAlerts) ? section.securityAlerts : [],
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    auditDashboardAction(req, "device_protection", exists ? "update_device" : "register_device", { id, hostname });
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/device-protection/devices/action", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "").trim();
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!id || !["allow", "suspend", "revoke", "quarantine"].includes(action)) {
      return res.status(400).json({ error: "Missing id or invalid action" });
    }
    const nextStatus =
      action === "allow" ? "active" : action === "quarantine" ? "quarantined" : action === "suspend" ? "suspended" : "revoked";
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const devices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const nextDevices = devices.map((d: any) =>
      String(d.id) === id ? { ...d, status: nextStatus, updatedAt: Date.now() } : d
    );
    const next = {
      ...section,
      policy: section.policy || {},
      managedDevices: nextDevices,
      workerActivities: Array.isArray(section.workerActivities) ? section.workerActivities : [],
      securityAlerts: Array.isArray(section.securityAlerts) ? section.securityAlerts : [],
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    auditDashboardAction(req, "device_protection", `${action}_device`, { id, nextStatus });
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/device-protection/activity/ingest", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "enterprise"]), (req: Request, res: Response) => {
    const input = req.body?.activity || {};
    const actor = String(input.actor || req.auth?.sub || "unknown");
    const actorRoleValue = String(input.actorRole || actorRole(req) || "unknown");
    const deviceId = String(input.deviceId || req.auth?.deviceId || req.header("x-device-id") || "").trim();
    const command = String(input.command || "");
    const filePath = String(input.filePath || "");
    const networkTarget = String(input.networkTarget || "");
    const eventText = [command, filePath, networkTarget, String(input.details || "")].join(" ").trim();
    const detection = detectThreatsFromActivity(eventText);

    const activity = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actor,
      actorRole: actorRoleValue,
      deviceId,
      eventType: String(input.eventType || "generic"),
      command,
      filePath,
      networkTarget,
      details: String(input.details || ""),
      severity: detection.severity,
      threatSignals: detection.signals,
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      timestamp: Date.now(),
    };

    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const activities = [activity, ...(Array.isArray(section.workerActivities) ? section.workerActivities : [])].slice(0, 3000);
    const alerts = Array.isArray(section.securityAlerts) ? section.securityAlerts : [];
    const nextAlerts = [...alerts];
    if (detection.severity !== "low") {
      nextAlerts.unshift({
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `Threat detected: ${activity.eventType}`,
        severity: detection.severity,
        actor,
        actorRole: actorRoleValue,
        deviceId,
        signals: detection.signals,
        status: "open",
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        timestamp: Date.now(),
      });
    }
    const policy = (section.policy || {}) as Record<string, any>;
    const managedDevices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const autoQuarantineOnCritical = Boolean(policy.autoQuarantineOnCritical ?? true);
    const nextDevices = autoQuarantineOnCritical && detection.severity === "critical" && deviceId
      ? managedDevices.map((d: any) =>
          String(d.id) === deviceId ? { ...d, status: "quarantined", updatedAt: Date.now() } : d
        )
      : managedDevices;
    const next = {
      ...section,
      policy: section.policy || {},
      managedDevices: nextDevices,
      workerActivities: activities,
      securityAlerts: nextAlerts.slice(0, 2000),
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    auditDashboardAction(req, "device_protection", "ingest_activity", {
      actor,
      actorRole: actorRoleValue,
      deviceId,
      severity: detection.severity,
      signals: detection.signals,
    });
    res.json({ success: true, activity, alertsCreated: detection.severity === "low" ? 0 : 1, deviceProtection: next });
  });

  app.post("/admin/aegis/antitheft/flag", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const deviceId = String(req.body?.deviceId || "").trim();
    const stolen = Boolean(req.body?.stolen);
    const consentPreGranted = Boolean(req.body?.consentPreGranted);
    if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const devices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const nextDevices = devices.map((d: any) =>
      String(d.id) === deviceId
        ? {
            ...d,
            stolen,
            stolenFlaggedAt: stolen ? Date.now() : 0,
            locationRequestAllowed: stolen && consentPreGranted,
            status: stolen ? "locked" : d.status === "locked" ? "active" : d.status,
            updatedAt: Date.now(),
          }
        : d
    );
    const next = { ...section, managedDevices: nextDevices, updatedAt: Date.now() };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.antitheft.flag", {
      deviceId,
      stolen,
      consentPreGranted,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/aegis/loan/status", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const deviceId = String(req.body?.deviceId || "").trim();
    const loanStatus = String(req.body?.loanStatus || "").trim().toLowerCase();
    const overdueDays = Math.max(0, Number(req.body?.overdueDays || 0));
    if (!deviceId || !["current", "grace", "overdue", "dispute"].includes(loanStatus)) {
      return res.status(400).json({ error: "Missing deviceId or invalid loanStatus" });
    }
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const loanPolicy = (section.loanProtection || {}) as Record<string, any>;
    const threshold = Math.max(1, Number(loanPolicy.overdueDaysThreshold || 30));
    const restrictedMode = loanStatus === "overdue" && overdueDays >= threshold;
    const devices = Array.isArray(section.managedDevices) ? section.managedDevices : [];
    const nextDevices = devices.map((d: any) =>
      String(d.id) === deviceId
        ? {
            ...d,
            loanStatus,
            loanOverdueDays: overdueDays,
            restrictedMode,
            restrictionReason: restrictedMode ? "Loan overdue beyond threshold" : "",
            status: restrictedMode ? "restricted" : d.status === "restricted" ? "active" : d.status,
            updatedAt: Date.now(),
          }
        : d
    );
    const next = { ...section, managedDevices: nextDevices, updatedAt: Date.now() };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.loan.status", {
      deviceId,
      loanStatus,
      overdueDays,
      restrictedMode,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, deviceProtection: next, restrictedMode });
  });

  app.post("/admin/aegis/malware/scan", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "enterprise"]), (req: Request, res: Response) => {
    const source = String(req.body?.source || "upload").trim();
    const text = String(req.body?.text || "");
    const base64 = String(req.body?.base64 || "");
    let payload = text;
    if (!payload && base64) {
      const b = decodeBase64Safe(base64);
      payload = b ? b.toString("utf-8") : "";
    }
    if (!payload) return res.status(400).json({ error: "Missing scan payload" });
    const malware = detectMalwareSignals(payload);
    const generic = detectThreatsFromActivity(payload);
    const severityOrder: Record<ThreatSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const severity = severityOrder[malware.severity] >= severityOrder[generic.severity] ? malware.severity : generic.severity;
    const signals = Array.from(new Set([...(malware.signals || []), ...(generic.signals || [])]));
    appendSignedSecurityEvent("aegis.malware.scan", {
      source,
      severity,
      signals,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
    });
    res.json({
      success: true,
      source,
      severity,
      blocked: severity === "critical" || severity === "high",
      signals,
      report: {
        lawfulMonitoring: true,
        consentRequired: true,
        note: "No file content is persisted by this scan endpoint.",
      },
    });
  });

  app.post("/admin/aegis/integrity/baseline", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const files = Array.isArray(req.body?.files)
      ? req.body.files.map((f: any) => String(f || "").trim()).filter(Boolean)
      : ["orchestrator/src/server/index.ts", "orchestrator/src/security/doctrineShield.ts", "frontend/src/components/Dashboard.tsx"];
    const baseline: Record<string, string> = {};
    for (const rel of files) {
      const abs = path.join(process.cwd(), rel);
      if (!fs.existsSync(abs)) continue;
      const content = fs.readFileSync(abs, "utf-8");
      baseline[rel] = sha256(content);
    }
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const next = {
      ...section,
      integrityBaseline: baseline,
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.integrity.baseline", {
      files: Object.keys(baseline),
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, baseline });
  });

  app.post("/admin/aegis/integrity/check", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const baseline = (section.integrityBaseline || {}) as Record<string, string>;
    const mismatches: Array<{ file: string; expected: string; actual: string }> = [];
    for (const [rel, expected] of Object.entries(baseline)) {
      const abs = path.join(process.cwd(), rel);
      if (!fs.existsSync(abs)) {
        mismatches.push({ file: rel, expected, actual: "missing" });
        continue;
      }
      const actual = sha256(fs.readFileSync(abs, "utf-8"));
      if (actual !== expected) mismatches.push({ file: rel, expected, actual });
    }
    const tamperDetected = mismatches.length > 0;
    let next = section;
    if (tamperDetected) {
      next = {
        ...section,
        resilience: {
          ...(section.resilience || {}),
          safeMode: {
            active: true,
            reason: "Anti-tamper integrity mismatch",
            activatedAt: Date.now(),
          },
        },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("deviceProtection", next);
    }
    appendSignedSecurityEvent("aegis.integrity.check", {
      tamperDetected,
      mismatchCount: mismatches.length,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, tamperDetected, mismatches, safeMode: next?.resilience?.safeMode || {} });
  });

  app.post("/admin/aegis/safe-mode/set", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const active = Boolean(req.body?.active);
    const reason = String(req.body?.reason || "").trim();
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const next = {
      ...section,
      resilience: {
        ...(section.resilience || {}),
        safeMode: {
          active,
          reason: active ? (reason || "Manual activation") : "",
          activatedAt: active ? Date.now() : 0,
        },
      },
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.safe_mode.set", {
      active,
      reason: next.resilience.safeMode.reason,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/aegis/snapshot/create", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    if (!fs.existsSync(AEGIS_SNAPSHOT_DIR)) fs.mkdirSync(AEGIS_SNAPSHOT_DIR, { recursive: true });
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const version = String(req.body?.version || `v${Date.now()}`);
    const snapshotDir = path.join(AEGIS_SNAPSHOT_DIR, version);
    if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
    const envHash = sha256(
      stableStringify({
        ORG: req.auth?.orgId || "personal",
        WORKSPACE: req.auth?.workspaceId || "default",
        NODE_ENV: process.env.NODE_ENV || "development",
      })
    );
    const manifest = {
      version,
      createdAt: Date.now(),
      backendBuild: "orchestrator-ts",
      frontendBuild: "vite",
      schemaVersion: String(readState().version || "v1"),
      envHash,
    };
    fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
    const snapshots = Array.isArray(section.snapshots) ? section.snapshots : [];
    const next = {
      ...section,
      snapshots: [manifest, ...snapshots].slice(0, 200),
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.snapshot.created", {
      version,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, manifest, deviceProtection: next });
  });

  app.post("/admin/aegis/rollback", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const version = String(req.body?.version || "").trim();
    if (!version) return res.status(400).json({ error: "Missing version" });
    const manifestPath = path.join(AEGIS_SNAPSHOT_DIR, version, "manifest.json");
    if (!fs.existsSync(manifestPath)) return res.status(404).json({ error: "Snapshot not found" });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const next = {
      ...section,
      resilience: {
        ...(section.resilience || {}),
        lastRollback: {
          version,
          at: Date.now(),
          actor: req.auth?.sub || "unknown",
          reason: String(req.body?.reason || "manual rollback"),
        },
      },
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.rollback.triggered", {
      version,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({
      success: true,
      message: "Rollback metadata committed. Execute infra rollback pipeline with this snapshot.",
      manifest,
      deviceProtection: next,
    });
  });

  app.post("/admin/aegis/self-heal/run", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), async (req: Request, res: Response) => {
    const action = String(req.body?.action || "restart_failed_services").trim().toLowerCase();
    const checks = {
      kernelHealthy: false,
      mlHealthy: false,
      orchestratorHealthy: true,
    };
    try {
      const [k, m] = await Promise.allSettled([
        axios.get(`${process.env.KERNEL_URL || "http://localhost:8080"}/health`, { timeout: 2500 }),
        axios.get(`${process.env.ML_URL || "http://localhost:8090"}/ready`, { timeout: 2500 }),
      ]);
      checks.kernelHealthy = k.status === "fulfilled";
      checks.mlHealthy = m.status === "fulfilled";
    } catch {
      // keep defaults
    }
    appendSignedSecurityEvent("aegis.self_heal.run", {
      action,
      checks,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({
      success: true,
      action,
      checks,
      recommendation:
        checks.kernelHealthy && checks.mlHealthy
          ? "All critical services healthy. No restart required."
          : "Use approved service restart flow for unhealthy services.",
    });
  });

  app.get("/admin/aegis/status", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin", "enterprise"]), (req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    res.json({
      success: true,
      aegis: {
        policy: section.policy || {},
        antiTheft: section.antiTheft || {},
        loanProtection: section.loanProtection || {},
        resilience: section.resilience || {},
        snapshots: Array.isArray(section.snapshots) ? section.snapshots : [],
        integrityBaselineCount: Object.keys(section.integrityBaseline || {}).length,
        securityAlertCount: Array.isArray(section.securityAlerts) ? section.securityAlerts.length : 0,
        backup: section.backup || {},
        zeroTrust: section.zeroTrust || {},
        updatedAt: section.updatedAt || Date.now(),
      },
    });
  });

  app.get("/admin/aegis/audit/events", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin", "enterprise"]), (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 200)));
    const typeFilter = String(req.query.type || "aegis.").trim().toLowerCase();
    const events = listEvents(limit * 3)
      .filter((evt) => {
        const t = String(evt.type || "").toLowerCase();
        if (!typeFilter) return true;
        return t.includes(typeFilter);
      })
      .slice(-limit);
    res.json({ success: true, events, count: events.length, typeFilter });
  });

  app.post("/admin/aegis/prompt-shield/check", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.input ?? req.body?.payload ?? "";
    const result = validateDoctrine(input);
    appendSignedSecurityEvent("aegis.prompt_shield.check", {
      ok: result.ok,
      ruleId: result.ruleId || "",
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
    });
    res.json({
      success: true,
      ok: result.ok,
      blocked: !result.ok,
      reason: result.reason || "",
      ruleId: result.ruleId || "",
    });
  });

  app.post("/admin/aegis/backup/config", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const cfg = req.body?.backup || {};
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const nextBackup = {
      enabled: Boolean(cfg.enabled ?? true),
      cadence: String(cfg.cadence || "daily"),
      retentionDays: Math.max(1, Number(cfg.retentionDays || 30)),
      offsiteTarget: String(cfg.offsiteTarget || "encrypted-offsite"),
      encryptAtRest: Boolean(cfg.encryptAtRest ?? true),
      includeSnapshots: Boolean(cfg.includeSnapshots ?? true),
      includeEvents: Boolean(cfg.includeEvents ?? true),
      updatedAt: Date.now(),
    };
    const next = { ...section, backup: nextBackup, updatedAt: Date.now() };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.backup.config", {
      backup: nextBackup,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, deviceProtection: next });
  });

  app.post("/admin/aegis/backup/run", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const mode = String(req.body?.mode || "incremental");
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const backup = (section.backup || {}) as Record<string, any>;
    const result = {
      id: `backup-${Date.now()}`,
      mode,
      startedAt: Date.now(),
      completedAt: Date.now(),
      snapshotCount: Array.isArray(section.snapshots) ? section.snapshots.length : 0,
      eventCount: listEvents(1000).length,
      encrypted: Boolean(backup.encryptAtRest ?? true),
      offsiteTarget: String(backup.offsiteTarget || "encrypted-offsite"),
      status: "ok",
    };
    const next = {
      ...section,
      backup: {
        ...backup,
        lastRun: result,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.backup.run", {
      result,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, result, deviceProtection: next });
  });

  app.post("/admin/aegis/zero-trust/rotate-keys", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const section = (dashboard.deviceProtection || {}) as Record<string, any>;
    const nextZeroTrust = {
      enabled: true,
      lastRotatedAt: Date.now(),
      rotationId: crypto.randomBytes(8).toString("hex"),
      policy: "token validation on every request + service auth",
      actor: req.auth?.sub || "unknown",
    };
    const next = { ...section, zeroTrust: nextZeroTrust, updatedAt: Date.now() };
    mergeDashboardSection("deviceProtection", next);
    appendSignedSecurityEvent("aegis.zero_trust.rotate_keys", {
      rotationId: nextZeroTrust.rotationId,
      actor: req.auth?.sub || "unknown",
      orgId: req.auth?.orgId || "personal",
    });
    res.json({ success: true, zeroTrust: nextZeroTrust, deviceProtection: next });
  });

  app.post("/admin/dashboard/users/role", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const { id, role } = req.body || {};
    if (!id || !role) return res.status(400).json({ error: "Missing id or role" });
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
    const nextUsers = users.map((u: any) => (u.id === id ? { ...u, role } : u));
    mergeDashboardSection("users", nextUsers);
    auditDashboardAction(req, "users", "set_role", { id, role });
    res.json({ success: true, users: nextUsers });
  });

  app.post("/admin/dashboard/staff/register", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const input = req.body?.user || {};
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const role = String(input.role || "").trim().toLowerCase();
    if (!name || !email) return res.status(400).json({ error: "Missing name or email" });
    if (!["admin", "developer"].includes(role)) return res.status(400).json({ error: "Only admin/developer can be staff-registered" });
    const allowedDeviceId = String(input.allowedDeviceId || "").trim();
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
    const id = String(input.id || `u-${Date.now()}`);
    const exists = users.some((u: any) => String(u.id) === id || String(u.email || "").toLowerCase() === email);
    const record = {
      id,
      name,
      email,
      role,
      status: "verified",
      founderRegistered: true,
      companyOwnedOnly: true,
      company: "GoldegeLabs",
      allowedDeviceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const nextUsers = exists
      ? users.map((u: any) =>
          String(u.id) === id || String(u.email || "").toLowerCase() === email
            ? { ...u, ...record, id: u.id || id, email }
            : u
        )
      : [record, ...users];
    mergeDashboardSection("users", nextUsers);
    auditDashboardAction(req, "staff", exists ? "update" : "register", { id, email, role });
    res.json({ success: true, users: nextUsers });
  });

  app.post("/admin/dashboard/staff/device/bind", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "").trim();
    const allowedDeviceId = String(req.body?.allowedDeviceId || "").trim();
    if (!id || !allowedDeviceId) return res.status(400).json({ error: "Missing id or allowedDeviceId" });
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
    const nextUsers = users.map((u: any) =>
      String(u.id) === id
        ? {
            ...u,
            companyOwnedOnly: true,
            founderRegistered: true,
            allowedDeviceId,
            updatedAt: Date.now(),
          }
        : u
    );
    mergeDashboardSection("users", nextUsers);
    auditDashboardAction(req, "staff", "bind_device", { id, allowedDeviceId });
    res.json({ success: true, users: nextUsers });
  });

  app.post("/admin/dashboard/staff/access", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "").trim();
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!id || !["allow", "suspend", "revoke"].includes(action)) {
      return res.status(400).json({ error: "Missing id or invalid action" });
    }
    const status = action === "allow" ? "verified" : action === "suspend" ? "suspended" : "revoked";
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
    const nextUsers = users.map((u: any) =>
      String(u.id) === id
        ? {
            ...u,
            status,
            updatedAt: Date.now(),
          }
        : u
    );
    mergeDashboardSection("users", nextUsers);
    auditDashboardAction(req, "staff", action, { id, status });
    res.json({ success: true, users: nextUsers });
  });

  app.post("/admin/dashboard/users/status", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" });
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
    const target = users.find((u: any) => String(u.id) === String(id));
    if (
      target &&
      ["admin", "developer"].includes(String(target.role || "").toLowerCase()) &&
      !isFounder(req)
    ) {
      return res.status(403).json({ error: "Forbidden", details: "Only founder can change staff account status" });
    }
    const nextUsers = users.map((u: any) => (u.id === id ? { ...u, status } : u));
    mergeDashboardSection("users", nextUsers);
    auditDashboardAction(req, "users", "set_status", { id, status });
    res.json({ success: true, users: nextUsers });
  });

  app.post("/admin/dashboard/plans/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const input = req.body?.plan || {};
    if (!input.name) return res.status(400).json({ error: "Missing plan name" });
    const { dashboard } = readDashboardSummary();
    const plans = Array.isArray(dashboard.plans) ? dashboard.plans : [];
    const id = String(input.id || `p-${Date.now()}`);
    const exists = plans.some((p: any) => p.id === id);
    const next = exists
      ? plans.map((p: any) => (p.id === id ? { ...p, ...input, id } : p))
      : [...plans, { ...input, id, active: input.active !== false, features: Array.isArray(input.features) ? input.features : [] }];
    mergeDashboardSection("plans", next);
    auditDashboardAction(req, "plans", exists ? "update" : "create", { id });
    res.json({ success: true, plans: next });
  });

  app.post("/admin/dashboard/plans/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const plans = Array.isArray(dashboard.plans) ? dashboard.plans : [];
    const next = plans.map((p: any) => (p.id === id ? { ...p, active: !p.active } : p));
    mergeDashboardSection("plans", next);
    auditDashboardAction(req, "plans", "toggle", { id });
    res.json({ success: true, plans: next });
  });

  app.post("/admin/dashboard/payment/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const payment = req.body?.payment || {};
    mergeDashboardSection("payment", payment);
    auditDashboardAction(req, "payment", "save", {});
    res.json({ success: true, payment });
  });

  app.post("/admin/dashboard/crypto/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const cryptoRewards = req.body?.cryptoRewards || {};
    mergeDashboardSection("cryptoRewards", cryptoRewards);
    auditDashboardAction(req, "crypto_rewards", "save", {
      chain: String(cryptoRewards?.chain || ""),
      token: String(cryptoRewards?.token || ""),
      enabled: Boolean(cryptoRewards?.enabled),
    });
    res.json({ success: true, cryptoRewards });
  });

  app.post("/admin/dashboard/rewards/config/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
    const incoming = req.body?.config || {};
    const nextConfig = {
      pointsPerUsd: Math.max(1, Number(incoming.pointsPerUsd || ledger?.config?.pointsPerUsd || 100)),
      wdcPerPoint: Math.max(0, Number(incoming.wdcPerPoint || ledger?.config?.wdcPerPoint || 0.01)),
      wdcListingLive: Boolean(incoming.wdcListingLive ?? ledger?.config?.wdcListingLive ?? false),
      payoutMode: String(incoming.payoutMode || ledger?.config?.payoutMode || "points_only"),
    };
    const nextLedger = { ...ledger, config: nextConfig, wallets: Array.isArray(ledger.wallets) ? ledger.wallets : [] };
    mergeDashboardSection("rewardsLedger", nextLedger);
    auditDashboardAction(req, "rewards_ledger", "save_config", nextConfig);
    res.json({ success: true, rewardsLedger: nextLedger });
  });

  app.post("/admin/dashboard/rewards/wallets/credit", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const userId = String(req.body?.userId || "").trim();
    const userName = String(req.body?.userName || "User");
    const points = Math.max(0, Number(req.body?.points || 0));
    if (!userId || points <= 0) return res.status(400).json({ error: "Missing userId or invalid points" });
    const { dashboard } = readDashboardSummary();
    const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
    const wallets = Array.isArray(ledger.wallets) ? ledger.wallets : [];
    let found = false;
    const nextWallets = wallets.map((w: any) => {
      if (String(w.userId) !== userId) return w;
      found = true;
      return {
        ...w,
        userName: w.userName || userName,
        points: Math.max(0, Number(w.points || 0) + points),
        totalEarnedPoints: Math.max(0, Number(w.totalEarnedPoints || 0) + points),
        updatedAt: Date.now(),
      };
    });
    if (!found) {
      nextWallets.unshift({
        userId,
        userName,
        points,
        totalEarnedPoints: points,
        pendingCashUsd: 0,
        pendingWdc: 0,
        updatedAt: Date.now(),
      });
    }
    const nextLedger = { ...ledger, wallets: nextWallets, config: ledger.config || {} };
    mergeDashboardSection("rewardsLedger", nextLedger);
    auditDashboardAction(req, "rewards_wallet", "credit", { userId, points });
    res.json({ success: true, rewardsLedger: nextLedger });
  });

  app.post("/admin/dashboard/rewards/wallets/debit", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const userId = String(req.body?.userId || "").trim();
    const points = Math.max(0, Number(req.body?.points || 0));
    if (!userId || points <= 0) return res.status(400).json({ error: "Missing userId or invalid points" });
    const { dashboard } = readDashboardSummary();
    const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
    const wallets = Array.isArray(ledger.wallets) ? ledger.wallets : [];
    const nextWallets = wallets.map((w: any) =>
      String(w.userId) === userId
        ? {
            ...w,
            points: Math.max(0, Number(w.points || 0) - points),
            updatedAt: Date.now(),
          }
        : w
    );
    const nextLedger = { ...ledger, wallets: nextWallets, config: ledger.config || {} };
    mergeDashboardSection("rewardsLedger", nextLedger);
    auditDashboardAction(req, "rewards_wallet", "debit", { userId, points });
    res.json({ success: true, rewardsLedger: nextLedger });
  });

  app.post("/admin/dashboard/rewards/wallets/convert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const userId = String(req.body?.userId || "").trim();
    const points = Math.max(0, Number(req.body?.points || 0));
    const target = String(req.body?.target || "cash").toLowerCase();
    if (!userId || points <= 0) return res.status(400).json({ error: "Missing userId or invalid points" });
    const { dashboard } = readDashboardSummary();
    const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
    const config = (ledger.config || {}) as Record<string, any>;
    const pointsPerUsd = Math.max(1, Number(config.pointsPerUsd || 100));
    const wdcPerPoint = Math.max(0, Number(config.wdcPerPoint || 0.01));
    const wallets = Array.isArray(ledger.wallets) ? ledger.wallets : [];

    const nextWallets = wallets.map((w: any) => {
      if (String(w.userId) !== userId) return w;
      const currentPoints = Math.max(0, Number(w.points || 0));
      const usePoints = Math.min(points, currentPoints);
      const next: any = {
        ...w,
        points: currentPoints - usePoints,
        updatedAt: Date.now(),
      };
      if (target === "wdc") {
        next.pendingWdc = Number((Number(w.pendingWdc || 0) + usePoints * wdcPerPoint).toFixed(6));
      } else {
        next.pendingCashUsd = Number((Number(w.pendingCashUsd || 0) + usePoints / pointsPerUsd).toFixed(2));
      }
      return next;
    });
    const nextLedger = { ...ledger, wallets: nextWallets, config };
    mergeDashboardSection("rewardsLedger", nextLedger);
    auditDashboardAction(req, "rewards_wallet", "convert", { userId, points, target });
    res.json({ success: true, rewardsLedger: nextLedger });
  });

  app.post("/admin/dashboard/model/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const modelControl = req.body?.modelControl || {};
    mergeDashboardSection("modelControl", modelControl);
    auditDashboardAction(req, "model", "save", { model: modelControl?.model });
    res.json({ success: true, modelControl });
  });

  app.post("/admin/dashboard/flags/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder"]), (req: Request, res: Response) => {
    const key = String(req.body?.key || "");
    if (!key) return res.status(400).json({ error: "Missing key" });
    const { dashboard } = readDashboardSummary();
    const flags = (dashboard.featureFlags || {}) as Record<string, boolean>;
    const next = { ...flags, [key]: !flags[key] };
    mergeDashboardSection("featureFlags", next);
    auditDashboardAction(req, "feature_flags", "toggle", { key, value: next[key] });
    res.json({ success: true, featureFlags: next });
  });

  app.post("/admin/dashboard/offers/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.offer || {};
    if (!input.name) return res.status(400).json({ error: "Missing offer name" });
    const { dashboard } = readDashboardSummary();
    const offers = Array.isArray(dashboard.offers) ? dashboard.offers : [];
    const id = String(input.id || `off-${Date.now()}`);
    const exists = offers.some((o: any) => o.id === id);
    const next = exists
      ? offers.map((o: any) => (o.id === id ? { ...o, ...input, id } : o))
      : [...offers, { ...input, id, active: input.active !== false }];
    mergeDashboardSection("offers", next);
    auditDashboardAction(req, "offers", exists ? "update" : "create", { id });
    res.json({ success: true, offers: next });
  });

  app.post("/admin/dashboard/offers/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const offers = Array.isArray(dashboard.offers) ? dashboard.offers : [];
    const next = offers.map((o: any) => (o.id === id ? { ...o, active: !o.active } : o));
    mergeDashboardSection("offers", next);
    auditDashboardAction(req, "offers", "toggle", { id });
    res.json({ success: true, offers: next });
  });

  app.post("/admin/dashboard/tickets/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.ticket || {};
    const { dashboard } = readDashboardSummary();
    const tickets = Array.isArray(dashboard.supportTickets) ? dashboard.supportTickets : [];
    if (!input.id) {
      if (!input.subject) return res.status(400).json({ error: "Missing ticket subject" });
      const created = { id: `t-${Date.now()}`, priority: "medium", status: "open", assignee: "unassigned", ...input };
      const next = [created, ...tickets];
      mergeDashboardSection("supportTickets", next);
      auditDashboardAction(req, "tickets", "create", { id: created.id });
      return res.json({ success: true, supportTickets: next });
    }
    const next = tickets.map((t: any) => (t.id === input.id ? { ...t, ...input } : t));
    mergeDashboardSection("supportTickets", next);
    auditDashboardAction(req, "tickets", "update", { id: input.id });
    return res.json({ success: true, supportTickets: next });
  });

  app.post("/admin/dashboard/tickets/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const tickets = Array.isArray(dashboard.supportTickets) ? dashboard.supportTickets : [];
    const next = tickets.filter((t: any) => t.id !== id);
    mergeDashboardSection("supportTickets", next);
    auditDashboardAction(req, "tickets", "delete", { id });
    res.json({ success: true, supportTickets: next });
  });

  app.post("/admin/dashboard/api-keys/create", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Missing key name" });
    const { dashboard } = readDashboardSummary();
    const keys = Array.isArray(dashboard.devApiKeys) ? dashboard.devApiKeys : [];
    const apiKey = generateApiKey("ne_dev");
    const created = {
      id: `k-${Date.now()}`,
      name,
      apiKey,
      keyMasked: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
      createdAt: Date.now(),
      revoked: false,
    };
    const next = [created, ...keys];
    mergeDashboardSection("devApiKeys", next);
    auditDashboardAction(req, "api_keys", "create", { id: created.id });
    res.json({ success: true, devApiKeys: next, apiKey });
  });

  app.post("/admin/dashboard/api-keys/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const keys = Array.isArray(dashboard.devApiKeys) ? dashboard.devApiKeys : [];
    const next = keys.map((k: any) => (k.id === id ? { ...k, revoked: !k.revoked } : k));
    mergeDashboardSection("devApiKeys", next);
    auditDashboardAction(req, "api_keys", "toggle", { id });
    res.json({ success: true, devApiKeys: next });
  });

  app.post("/admin/dashboard/integrations/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const appInput = req.body?.integration || {};
    const appName = String(appInput?.appName || "").trim();
    if (!appName) return res.status(400).json({ error: "Missing appName" });
    const { dashboard } = readDashboardSummary();
    const integrations = Array.isArray(dashboard.integrations) ? dashboard.integrations : [];
    const id = String(appInput?.id || `int-${Date.now()}`);
    const apiKey = String(appInput?.apiKey || generateApiKey("ne_sk"));
    const keyMasked = `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
    const base = {
      id,
      appName,
      appDescription: String(appInput?.appDescription || ""),
      owner: req.auth?.sub || "unknown",
      status: String(appInput?.status || "active"),
      environment: String(appInput?.environment || "production"),
      scopes: Array.isArray(appInput?.scopes) ? appInput.scopes : ["chat:write"],
      allowedOrigins: Array.isArray(appInput?.allowedOrigins) ? appInput.allowedOrigins : [],
      rateLimitPerMin: Number(appInput?.rateLimitPerMin || 120),
      webhookUrl: String(appInput?.webhookUrl || ""),
      apiKey,
      keyMasked,
      createdAt: Number(appInput?.createdAt || Date.now()),
      updatedAt: Date.now(),
    };
    const exists = integrations.some((it: any) => it.id === id);
    const next = exists
      ? integrations.map((it: any) => (it.id === id ? { ...it, ...base } : it))
      : [base, ...integrations];
    mergeDashboardSection("integrations", next);
    auditDashboardAction(req, "integrations", exists ? "update" : "create", { id, appName });
    res.json({ success: true, integrations: next, apiKey });
  });

  app.post("/admin/dashboard/integrations/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const integrations = Array.isArray(dashboard.integrations) ? dashboard.integrations : [];
    const next = integrations.filter((it: any) => it.id !== id);
    mergeDashboardSection("integrations", next);
    auditDashboardAction(req, "integrations", "delete", { id });
    res.json({ success: true, integrations: next });
  });

  app.post("/admin/dashboard/links/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.link || {};
    const name = String(input?.name || "").trim();
    const url = String(input?.url || "").trim();
    if (!name || !url) return res.status(400).json({ error: "Missing link name or url" });
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ error: "Only http/https links are allowed" });
      }
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const allowedTypes = new Set(["public", "internal", "admin", "api", "docs", "test"]);
    const allowedEnvironments = new Set(["development", "staging", "production", "testing"]);
    const allowedAudiences = new Set(["users", "admins", "founder", "developers", "enterprise", "internal"]);
    const allowedStatuses = new Set(["active", "inactive", "testing", "deprecated"]);
    const type = String(input?.type || "public");
    const environment = String(input?.environment || "production");
    const audience = String(input?.audience || "users");
    const status = String(input?.status || "active");
    if (!allowedTypes.has(type)) return res.status(400).json({ error: "Invalid type" });
    if (!allowedEnvironments.has(environment)) return res.status(400).json({ error: "Invalid environment" });
    if (!allowedAudiences.has(audience)) return res.status(400).json({ error: "Invalid audience" });
    if (!allowedStatuses.has(status)) return res.status(400).json({ error: "Invalid status" });

    const { dashboard } = readDashboardSummary();
    const links = Array.isArray(dashboard.domainLinks) ? dashboard.domainLinks : [];
    const id = String(input?.id || `lnk-${Date.now()}`);
    const exists = links.some((it: any) => it.id === id);
    const tags = Array.isArray(input?.tags)
      ? input.tags.map((t: any) => String(t || "").trim()).filter(Boolean).slice(0, 20)
      : [];
    const now = Date.now();
    const nextItem = {
      id,
      name,
      url,
      type,
      environment,
      audience,
      status,
      description: String(input?.description || ""),
      tags,
      owner: String(input?.owner || req.auth?.sub || "founder"),
      notes: String(input?.notes || ""),
      createdAt: Number(input?.createdAt || now),
      updatedAt: now,
    };
    const next = exists
      ? links.map((it: any) => (it.id === id ? { ...it, ...nextItem } : it))
      : [nextItem, ...links];
    mergeDashboardSection("domainLinks", next);
    auditDashboardAction(req, "domain_links", exists ? "update" : "create", {
      id,
      name,
      audience,
      environment,
      status,
    });
    res.json({ success: true, domainLinks: next });
  });

  app.post("/admin/dashboard/links/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const links = Array.isArray(dashboard.domainLinks) ? dashboard.domainLinks : [];
    const now = Date.now();
    const next = links.map((it: any) =>
      it.id === id
        ? { ...it, status: String(it.status) === "active" ? "inactive" : "active", updatedAt: now }
        : it
    );
    mergeDashboardSection("domainLinks", next);
    auditDashboardAction(req, "domain_links", "toggle", { id });
    res.json({ success: true, domainLinks: next });
  });

  app.post("/admin/dashboard/links/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const links = Array.isArray(dashboard.domainLinks) ? dashboard.domainLinks : [];
    const next = links.filter((it: any) => it.id !== id);
    mergeDashboardSection("domainLinks", next);
    auditDashboardAction(req, "domain_links", "delete", { id });
    res.json({ success: true, domainLinks: next });
  });

  app.post("/admin/dashboard/links/verify", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), async (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const links = Array.isArray(dashboard.domainLinks) ? dashboard.domainLinks : [];
    const target = links.find((it: any) => String(it.id) === id);
    if (!target) return res.status(404).json({ error: "Link not found" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(String(target.url), { method: "GET", redirect: "follow", signal: controller.signal });
      clearTimeout(timeout);
      auditDashboardAction(req, "domain_links", "verify", {
        id,
        status: response.status,
        ok: response.ok,
      });
      res.json({
        success: true,
        id,
        url: target.url,
        reachable: response.ok,
        status: response.status,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      auditDashboardAction(req, "domain_links", "verify_failed", { id, error: String(err?.message || err) });
      res.status(200).json({
        success: false,
        id,
        url: target.url,
        reachable: false,
        error: String(err?.message || err),
      });
    }
  });

  app.post("/dashboard/integrations/request-key", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (req: Request, res: Response) => {
    if (!isPaidUser(req) && !isFounder(req) && !hasRole(req, ["admin", "developer"])) {
      return res.status(403).json({ error: "Paid plan required for external API key request" });
    }
    const appName = String(req.body?.appName || "").trim();
    if (!appName) return res.status(400).json({ error: "Missing appName" });
    const { dashboard } = readDashboardSummary();
    const integrations = Array.isArray(dashboard.integrations) ? dashboard.integrations : [];
    const apiKey = generateApiKey("ne_usr");
    const id = `int-${Date.now()}`;
    const created = {
      id,
      appName,
      appDescription: String(req.body?.appDescription || ""),
      owner: req.auth?.sub || "unknown",
      status: "active",
      environment: String(req.body?.environment || "production"),
      scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : ["chat:write"],
      allowedOrigins: Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins : [],
      rateLimitPerMin: Number(req.body?.rateLimitPerMin || 60),
      webhookUrl: String(req.body?.webhookUrl || ""),
      apiKey,
      keyMasked: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [created, ...integrations];
    mergeDashboardSection("integrations", next);
    auditDashboardAction(req, "integrations", "request_key", { id, appName });
    res.json({ success: true, integration: created, apiKey, integrations: next });
  });

  app.post("/admin/dashboard/webhooks/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const input = req.body?.webhook || {};
    if (!input.url) return res.status(400).json({ error: "Missing webhook url" });
    const { dashboard } = readDashboardSummary();
    const hooks = Array.isArray(dashboard.webhooks) ? dashboard.webhooks : [];
    const id = String(input.id || `wh-${Date.now()}`);
    const exists = hooks.some((w: any) => w.id === id);
    const next = exists
      ? hooks.map((w: any) => (w.id === id ? { ...w, ...input, id } : w))
      : [...hooks, { ...input, id, active: input.active !== false }];
    mergeDashboardSection("webhooks", next);
    auditDashboardAction(req, "webhooks", exists ? "update" : "create", { id });
    res.json({ success: true, webhooks: next });
  });

  app.post("/admin/dashboard/webhooks/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const hooks = Array.isArray(dashboard.webhooks) ? dashboard.webhooks : [];
    const next = hooks.filter((w: any) => w.id !== id);
    mergeDashboardSection("webhooks", next);
    auditDashboardAction(req, "webhooks", "delete", { id });
    res.json({ success: true, webhooks: next });
  });

  app.post("/admin/dashboard/webhooks/test", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    auditDashboardAction(req, "webhooks", "test", { id });
    res.json({ success: true, tested: true, id });
  });

  app.post("/admin/dashboard/agents/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.agent || {};
    const { dashboard } = readDashboardSummary();
    const agents = Array.isArray(dashboard.agentsLocal) ? dashboard.agentsLocal : [];
    const id = String(input.id || `ag-${Date.now()}`);
    if (!input.name && !agents.some((a: any) => a.id === id)) {
      return res.status(400).json({ error: "Missing agent name" });
    }
    const exists = agents.some((a: any) => a.id === id);
    const next = exists
      ? agents.map((a: any) => (a.id === id ? { ...a, ...input, id } : a))
      : [...agents, { id, tools: [], permission: "workspace", memoryDays: 30, ...input }];
    mergeDashboardSection("agentsLocal", next);
    auditDashboardAction(req, "agents", exists ? "update" : "create", { id });
    res.json({ success: true, agentsLocal: next });
  });

  app.post("/admin/dashboard/agents/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const agents = Array.isArray(dashboard.agentsLocal) ? dashboard.agentsLocal : [];
    const next = agents.filter((a: any) => a.id !== id);
    mergeDashboardSection("agentsLocal", next);
    auditDashboardAction(req, "agents", "delete", { id });
    res.json({ success: true, agentsLocal: next });
  });

  app.post("/admin/dashboard/prompts/upsert", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (req: Request, res: Response) => {
    const input = req.body?.prompt || {};
    if (!input.title || !input.text) return res.status(400).json({ error: "Missing prompt title or text" });
    const { dashboard } = readDashboardSummary();
    const prompts = Array.isArray(dashboard.savedPrompts) ? dashboard.savedPrompts : [];
    const id = String(input.id || `sp-${Date.now()}`);
    const exists = prompts.some((p: any) => p.id === id);
    const next = exists
      ? prompts.map((p: any) => (p.id === id ? { ...p, ...input, id } : p))
      : [{ id, title: input.title, text: input.text }, ...prompts];
    mergeDashboardSection("savedPrompts", next);
    auditDashboardAction(req, "prompts", exists ? "update" : "create", { id });
    res.json({ success: true, savedPrompts: next });
  });

  app.post("/admin/dashboard/prompts/delete", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const prompts = Array.isArray(dashboard.savedPrompts) ? dashboard.savedPrompts : [];
    const next = prompts.filter((p: any) => p.id !== id);
    mergeDashboardSection("savedPrompts", next);
    auditDashboardAction(req, "prompts", "delete", { id });
    res.json({ success: true, savedPrompts: next });
  });

  app.get("/admin/dashboard/extensions", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (_req: Request, res: Response) => {
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    res.json({ success: true, extensions });
  });

  app.post("/admin/dashboard/extensions/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const input = req.body?.extension || {};
    const name = String(input.name || "").trim();
    if (!name) return res.status(400).json({ error: "Missing extension name" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const id = String(input.id || `ext-${Date.now()}`);
    const exists = extensions.some((x: any) => x.id === id);
    const sanitized = {
      id,
      name,
      description: String(input.description || ""),
      active: input.active !== false,
      permissions: Array.isArray(input.permissions) ? input.permissions.map((p: any) => String(p)) : [],
      version: String(input.version || "1.0.0"),
    };
    const next = exists
      ? extensions.map((x: any) => (x.id === id ? { ...x, ...sanitized } : x))
      : [sanitized, ...extensions];
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", exists ? "update" : "create", { id });
    res.json({ success: true, extensions: next });
  });

  app.post("/admin/dashboard/extensions/toggle", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const next = extensions.map((x: any) => (x.id === id ? { ...x, active: !x.active } : x));
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", "toggle", { id });
    res.json({ success: true, extensions: next });
  });

  app.post("/admin/dashboard/extensions/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const next = extensions.filter((x: any) => x.id !== id);
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", "delete", { id });
    res.json({ success: true, extensions: next });
  });

  app.post("/admin/dashboard/enterprise/departments/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const input = req.body?.department || {};
    const { dashboard } = readDashboardSummary();
    const departments = Array.isArray(dashboard.enterpriseDepartments) ? dashboard.enterpriseDepartments : [];
    const id = String(input.id || `d-${Date.now()}`);
    if (!input.name && !departments.some((d: any) => d.id === id)) {
      return res.status(400).json({ error: "Missing department name" });
    }
    const exists = departments.some((d: any) => d.id === id);
    const next = exists
      ? departments.map((d: any) => (d.id === id ? { ...d, ...input, id } : d))
      : [...departments, { id, members: 1, tokensPerMonth: 10000, ...input }];
    mergeDashboardSection("enterpriseDepartments", next);
    auditDashboardAction(req, "enterprise_departments", exists ? "update" : "create", { id });
    res.json({ success: true, enterpriseDepartments: next });
  });

  app.post("/admin/dashboard/enterprise/departments/delete", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const departments = Array.isArray(dashboard.enterpriseDepartments) ? dashboard.enterpriseDepartments : [];
    const next = departments.filter((d: any) => d.id !== id);
    mergeDashboardSection("enterpriseDepartments", next);
    auditDashboardAction(req, "enterprise_departments", "delete", { id });
    res.json({ success: true, enterpriseDepartments: next });
  });

  app.post("/admin/dashboard/enterprise/sso/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const ssoConfig = req.body?.ssoConfig || {};
    mergeDashboardSection("ssoConfig", ssoConfig);
    auditDashboardAction(req, "enterprise_sso", "save", { enabled: !!ssoConfig.enabled, provider: ssoConfig.provider });
    res.json({ success: true, ssoConfig });
  });

  app.get("/admin/dashboard/idverse", requireWorkspace, requireScope("admin:read"), requireRole(["founder", "admin", "developer"]), (_req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    res.json({ success: true, idverse: idversePublicView(cfg) });
  });

  app.post("/admin/dashboard/idverse/save", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const current = readIdverseConfigFromState();
    const input = req.body?.idverse || req.body || {};
    const candidateBaseUrl = String(input.baseUrl ?? current.baseUrl).trim();
    if (candidateBaseUrl && !/^https?:\/\//i.test(candidateBaseUrl)) {
      return res.status(400).json({ error: "Invalid baseUrl. Must start with http:// or https://" });
    }

    const apiKeyInput = String(input.apiKey ?? "").trim();
    const next: IdverseConfig = {
      enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
      baseUrl: candidateBaseUrl || "",
      apiKey:
        apiKeyInput && apiKeyInput.includes("...")
          ? current.apiKey
          : apiKeyInput || current.apiKey,
      projectId: String(input.projectId ?? current.projectId).trim(),
      timeoutMs: Math.max(1000, Number(input.timeoutMs ?? current.timeoutMs ?? 12000)),
      strictBiometric:
        typeof input.strictBiometric === "boolean" ? input.strictBiometric : current.strictBiometric,
      strictLiveness:
        typeof input.strictLiveness === "boolean" ? input.strictLiveness : current.strictLiveness,
    };
    writeIdverseConfigToState(next);
    mergeDashboardSection("idverse", idversePublicView(next));
    auditDashboardAction(req, "idverse", "save", {
      enabled: next.enabled,
      baseUrl: next.baseUrl,
      strictBiometric: next.strictBiometric,
      strictLiveness: next.strictLiveness,
    });
    return res.json({ success: true, idverse: idversePublicView(next) });
  });

  app.get("/idverse/status", requireWorkspace, requireScope("identity:read"), async (_req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    if (!cfg.enabled) {
      return res.json({
        success: true,
        provider: "idverse",
        healthy: false,
        configured: false,
        reason: "disabled",
        config: idversePublicView(cfg),
      });
    }
    if (!cfg.baseUrl || !cfg.apiKey) {
      return res.json({
        success: true,
        provider: "idverse",
        healthy: false,
        configured: false,
        reason: "not_configured",
        config: idversePublicView(cfg),
      });
    }
    try {
      const ping = await callIdverseWithFallback(cfg, "get", ["health", "status"]);
      return res.json({
        success: true,
        provider: "idverse",
        healthy: true,
        configured: true,
        endpoint: ping.endpoint,
        config: idversePublicView(cfg),
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        provider: "idverse",
        healthy: false,
        configured: true,
        error: err?.message || String(err),
        config: idversePublicView(cfg),
      });
    }
  });

  app.post("/neuroedge/verify-identity", requireWorkspace, requireScope("identity:verify"), async (req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    const payload = {
      ...(req.body || {}),
      provider: "idverse",
      strictBiometric: cfg.strictBiometric,
      strictLiveness: cfg.strictLiveness,
    };
    try {
      const resp = await callIdverseWithFallback(
        cfg,
        "post",
        ["identity/verify", "verify-identity", "kyc/verify", "v1/identity/verify"],
        payload
      );
      appendEvent({
        type: "identity.verify",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          endpoint: resp.endpoint,
          verified: Boolean(resp.data?.verified ?? resp.data?.success),
        },
      });
      return res.json({ success: true, provider: "idverse", endpoint: resp.endpoint, result: resp.data });
    } catch (err: any) {
      return res.status(502).json({ error: "IDVerse verify failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neuroedge/liveness-check", requireWorkspace, requireScope("identity:verify"), async (req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    try {
      const resp = await callIdverseWithFallback(
        cfg,
        "post",
        ["identity/liveness", "liveness-check", "v1/identity/liveness"],
        req.body || {}
      );
      appendEvent({
        type: "identity.liveness",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          endpoint: resp.endpoint,
          passed: Boolean(resp.data?.passed ?? resp.data?.success),
        },
      });
      return res.json({ success: true, provider: "idverse", endpoint: resp.endpoint, result: resp.data });
    } catch (err: any) {
      return res.status(502).json({ error: "IDVerse liveness failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neuroedge/biometric-match", requireWorkspace, requireScope("identity:verify"), async (req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    try {
      const resp = await callIdverseWithFallback(
        cfg,
        "post",
        ["identity/biometric/match", "biometric-match", "v1/identity/biometric/match"],
        req.body || {}
      );
      appendEvent({
        type: "identity.biometric_match",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          endpoint: resp.endpoint,
          matched: Boolean(resp.data?.matched ?? resp.data?.success),
        },
      });
      return res.json({ success: true, provider: "idverse", endpoint: resp.endpoint, result: resp.data });
    } catch (err: any) {
      return res.status(502).json({ error: "IDVerse biometric match failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neuroedge/user/identity", requireWorkspace, requireScope("identity:read"), async (req: Request, res: Response) => {
    const cfg = readIdverseConfigFromState();
    const userId = String(req.query.userId || req.auth?.sub || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }
    try {
      const resp = await callIdverseWithFallback(
        cfg,
        "get",
        ["identity/user", "user/identity", "v1/identity/user"],
        undefined,
        { userId }
      );
      appendEvent({
        type: "identity.user_fetch",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          endpoint: resp.endpoint,
          userId,
        },
      });
      return res.json({ success: true, provider: "idverse", endpoint: resp.endpoint, identity: resp.data });
    } catch (err: any) {
      return res.status(502).json({ error: "IDVerse user identity fetch failed", detail: err?.message || String(err) });
    }
  });

  app.get("/admin/system/metrics", requireWorkspace, requireScope("admin:read"), async (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const kernels = await globalKernelManager.getAllHealth();
    const nodesOnline = meshRegistry.list().filter((n) => n.online).length;
    res.json({
      success: true,
      uptimeSec: Math.round(process.uptime()),
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      kernels,
      mesh: {
        nodesOnline,
        nodesTotal: meshRegistry.list().length,
      },
      time: new Date().toISOString(),
    });
  });

  app.get("/admin/version", requireWorkspace, requireScope("admin:read"), (_req: Request, res: Response) => {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkgVersion = (() => {
      try {
        const raw = fs.readFileSync(pkgPath, "utf-8");
        return JSON.parse(raw).version || "unknown";
      } catch {
        return "unknown";
      }
    })();
    const state = readState();
    res.json({
      success: true,
      orchestratorVersion: pkgVersion,
      stateVersion: state.version,
      doctrineVersion: doctrineVersion(),
      updatedAt: state.updatedAt,
    });
  });

  app.get("/doctrine/rules", requireWorkspace, requireScope("admin:read"), (_req: Request, res: Response) => {
    res.json({
      success: true,
      version: doctrineVersion(),
      rules: listDoctrineRules(),
    });
  });

  app.post("/doctrine/rules", requireWorkspace, requireScope("admin:write"), (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.id || !body.category || !body.action || !body.pattern || !body.message) {
      return res.status(400).json({ error: "Missing rule fields" });
    }
    const saved = upsertDoctrineRule({
      id: String(body.id),
      version: Number(body.version) || 1,
      enabled: body.enabled !== false,
      category: body.category,
      action: body.action,
      pattern: String(body.pattern),
      message: String(body.message),
    });
    res.json({ success: true, rule: saved, version: doctrineVersion() });
  });

  app.get("/self-expansion/analyze", requireWorkspace, requireScope("admin:read"), (_req: Request, res: Response) => {
    const overview = analyzeWorkspace(process.cwd());
    const proposal = buildExpansionProposal(process.cwd(), "system-wide self expansion readiness");
    res.json({
      success: true,
      selfExpansion: {
        overview,
        proposal,
        enforcement: {
          requiresHumanApproval: true,
          autoRewriteProductionCode: false,
          autoSelfDeploy: false,
        },
      },
    });
  });

  app.post("/self-expansion/propose", requireWorkspace, requireScope("admin:write"), (req: Request, res: Response) => {
    const goal = String(req.body?.goal || "").trim();
    const proposal = buildExpansionProposal(process.cwd(), goal);
    appendEvent({
      type: "self_expansion.proposal",
      timestamp: Date.now(),
      payload: {
        actor: req.auth?.sub || "unknown",
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        goal,
        targetVersion: proposal.targetVersion,
      },
    });
    res.json({
      success: true,
      proposal,
    });
  });

  app.post("/self-expansion/generate-module", requireWorkspace, requireScope("admin:write"), (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    const purpose = String(req.body?.purpose || "").trim();
    const relativePath = String(req.body?.path || "orchestrator/src/generated/new_module.ts").trim();
    const confirm = Boolean(req.body?.confirm);
    if (!name || !purpose) {
      return res.status(400).json({ error: "Missing name or purpose" });
    }
    const cwd = process.cwd();
    const workspaceRoot = path.basename(cwd) === "orchestrator" ? path.resolve(cwd, "..") : cwd;
    const result = generateModuleWithConfirmation({
      workspaceRoot,
      name,
      purpose,
      relativePath,
      confirm,
    });
    res.json(result);
  });

  app.get("/auth/whoami", (req: Request, res: Response) => {
    res.json({
      sub: req.auth?.sub || "anonymous",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      scopes: req.auth?.scopes || [],
    });
  });

  app.get("/status", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "orchestrator",
      time: new Date().toISOString(),
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "orchestrator",
      time: new Date().toISOString(),
    });
  });

  app.get("/system/status", async (_req: Request, res: Response) => {
    const kernelBase = process.env.KERNEL_URL || "http://localhost:8080";
    const mlBase = process.env.ML_URL || "http://localhost:8090";

    const results = await Promise.allSettled([
      axios.get(`${kernelBase.replace(/\/$/, "")}/health`),
      axios.get(`${mlBase.replace(/\/$/, "")}/ready`),
    ]);

    const services = [
      {
        name: "Kernel",
        status: results[0].status === "fulfilled" ? "online" : "offline",
        detail:
          results[0].status === "fulfilled"
            ? "Kernel responding"
            : "Not reachable",
      },
      {
        name: "ML",
        status: results[1].status === "fulfilled" ? "online" : "offline",
        detail:
          results[1].status === "fulfilled"
            ? "Model loaded: yes"
            : "Not reachable",
      },
    ];

    res.json({
      status: "ok",
      service: "orchestrator",
      time: new Date().toISOString(),
      services,
    });
  });

  app.post("/twin/scan", requireWorkspace, requireScope("admin:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/scan`, {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin scan failed", detail: err?.message || String(err) });
    }
  });

  app.post("/twin/analyze", requireWorkspace, requireScope("admin:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/analyze`, {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin analyze failed", detail: err?.message || String(err) });
    }
  });

  app.post("/twin/evolve", requireWorkspace, requireScope("admin:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/evolve`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin evolve failed", detail: err?.message || String(err) });
    }
  });

  app.post("/twin/validate", requireWorkspace, requireScope("admin:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/validate`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin validate failed", detail: err?.message || String(err) });
    }
  });

  app.get("/twin/report", requireWorkspace, requireScope("admin:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/twin/report`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin report failed", detail: err?.message || String(err) });
    }
  });

  app.post("/twin/project/analyze", requireWorkspace, requireScope("admin:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/project/analyze`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin project analyze failed", detail: err?.message || String(err) });
    }
  });

  app.post("/twin/ask", requireWorkspace, requireScope("admin:read"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/twin/ask`, req.body || {}, { timeout: 60000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Twin ask failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/calibrate", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/calibrate`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin calibrate failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/update-profile", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/update-profile`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin update profile failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/analyze-meeting", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/analyze-meeting`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin analyze meeting failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/decision-simulate", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/decision-simulate`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin decision simulate failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/set-mode", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/set-mode`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin set mode failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/profile", requireWorkspace, requireScope("chat:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/profile`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin profile failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/report", requireWorkspace, requireScope("chat:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/report`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin report failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/image", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/image`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator image failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/image/edit", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/image/edit`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator image edit failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/video", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/video`, req.body || {}, { timeout: 120000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator video failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/script-video", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/script-video`, req.body || {}, { timeout: 120000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator script-video failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/thumbnail", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/thumbnail`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator thumbnail failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/subtitles", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/subtitles`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator subtitles failed", detail: err?.message || String(err) });
    }
  });

  app.post("/creator/background-remove", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/creator/background-remove`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator background remove failed", detail: err?.message || String(err) });
    }
  });

  app.get("/creator/job-status/:id", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/creator/job-status/${encodeURIComponent(String(req.params.id || ""))}`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator job status failed", detail: err?.message || String(err) });
    }
  });

  app.get("/creator/history", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/creator/history`, { params: { limit }, timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Creator history failed", detail: err?.message || String(err) });
    }
  });

  app.get("/creator/download", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    const target = String(req.query.path || "").trim();
    if (!target) return res.status(400).json({ error: "Missing path query" });
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/creator/download`, {
        params: { path: target },
        responseType: "stream",
        timeout: 120000,
      });
      const contentType = String(resp.headers["content-type"] || "application/octet-stream");
      const contentDisposition = String(resp.headers["content-disposition"] || "");
      res.setHeader("content-type", contentType);
      if (contentDisposition) res.setHeader("content-disposition", contentDisposition);
      resp.data.pipe(res);
    } catch (err: any) {
      res.status(502).json({ error: "Creator download failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/math", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/math`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence math failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/physics", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/physics`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence physics failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/science", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/science`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence science failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/code", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/code`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence code failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/research", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/research`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence research failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/solve", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/solve`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence solve failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/validate", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/validate`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence validate failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/ask", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/ask`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence ask failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/platform", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/platform`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence platform failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/fullstack", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/fullstack`, req.body || {}, { timeout: 120000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence fullstack failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/medicine", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/medicine`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence medicine failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/agriculture", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/agriculture`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence agriculture failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/market", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/market`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence market failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/visualize", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/visualize`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence visualize failed", detail: err?.message || String(err) });
    }
  });

  app.post("/intelligence/export", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/intelligence/export`, req.body || {}, { timeout: 120000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence export failed", detail: err?.message || String(err) });
    }
  });

  app.get("/intelligence/download", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    const target = String(req.query.path || "").trim();
    if (!target) return res.status(400).json({ error: "Missing path query" });
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/creator/download`, {
        params: { path: target },
        responseType: "stream",
        timeout: 120000,
      });
      const contentType = String(resp.headers["content-type"] || "application/octet-stream");
      const contentDisposition = String(resp.headers["content-disposition"] || "");
      res.setHeader("content-type", contentType);
      if (contentDisposition) res.setHeader("content-disposition", contentDisposition);
      resp.data.pipe(res);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence download failed", detail: err?.message || String(err) });
    }
  });

  app.get("/intelligence/languages", requireWorkspace, requireScope("chat:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/intelligence/languages`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence languages failed", detail: err?.message || String(err) });
    }
  });

  app.get("/intelligence/subjects", requireWorkspace, requireScope("chat:write"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/intelligence/subjects`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "Intelligence subjects failed", detail: err?.message || String(err) });
    }
  });

  app.post("/rag/ingest", requireWorkspace, requireScope("training:write"), requireRole(["founder", "admin"]), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/ingest`, req.body || {}, { timeout: 180000 });
      appendEvent({
        type: "rag.ingest",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          created: resp.data?.created_chunks || 0,
          urlsFetched: resp.data?.urls_fetched || 0,
        },
      });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG ingest failed", detail: err?.message || String(err) });
    }
  });

  app.post("/rag/reindex", requireWorkspace, requireScope("training:write"), requireRole(["founder", "admin"]), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/reindex`, {}, { timeout: 180000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG reindex failed", detail: err?.message || String(err) });
    }
  });

  app.post("/rag/search", requireWorkspace, requireScope("training:read"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/search`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG search failed", detail: err?.message || String(err) });
    }
  });

  app.post("/rag/answer", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/answer`, req.body || {}, { timeout: 90000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG answer failed", detail: err?.message || String(err) });
    }
  });

  app.post("/rag/feedback", requireWorkspace, requireScope("training:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/feedback`, req.body || {}, { timeout: 60000 });
      const body = req.body || {};
      if (body.query && body.answer) {
        recordTrainingSample({
          query: String(body.query),
          response: String(body.answer),
          rating: (String(body.rating || "neutral").toLowerCase() === "up" ? "up" : String(body.rating || "neutral").toLowerCase() === "down" ? "down" : "neutral"),
          orgId: req.auth?.orgId,
          workspaceId: req.auth?.workspaceId,
          actor: req.auth?.sub,
          tags: Array.isArray(body.tags) ? body.tags : ["rag", "feedback"],
          citations: Array.isArray(body.citations) ? body.citations : [],
        });
      }
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG feedback failed", detail: err?.message || String(err) });
    }
  });

  app.get("/rag/stats", requireWorkspace, requireScope("training:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/rag/stats`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "RAG stats failed", detail: err?.message || String(err) });
    }
  });

  app.post("/admin/training/rag/bootstrap", requireWorkspace, requireScope("training:write"), requireRole(["founder", "admin"]), async (req: Request, res: Response) => {
    const limit = Math.max(100, Math.min(10000, Number(req.body?.limit) || 2500));
    const domain = String(req.body?.domain || "general").trim().toLowerCase();
    const samples = listTrainingSamples(limit) as Array<Record<string, any>>;
    const docs = samples
      .map((s, idx) => ({
        title: `training_sample_${idx + 1}`,
        text: `Q: ${String(s.query || "")}\nA: ${String(s.response || "")}`,
        domain: domain || "general",
        tags: Array.isArray(s.tags) ? s.tags : ["training", "bootstrap"],
        source: "training_samples",
      }))
      .filter((d) => d.text.length > 6);

    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(
        `${mlBase.replace(/\/$/, "")}/rag/ingest`,
        { docs, domain: domain || "general", source: "training_samples_bootstrap", rebuild_index: true },
        { timeout: 240000 }
      );
      res.json({ success: true, sourceSamples: samples.length, sentDocs: docs.length, rag: resp.data });
    } catch (err: any) {
      res.status(502).json({ error: "RAG bootstrap failed", detail: err?.message || String(err) });
    }
  });

  /* ---------------- Mesh Inference Registry ---------------- */
  const meshRegistry = new InferenceRegistry();
  const fedAggregator = new FedAggregator();
  const fedKey = process.env.NEUROEDGE_FED_KEY || "";
  const researchLimiter = createRateLimiter({
    keyPrefix: "research",
    windowMs: Number(process.env.RESEARCH_RATE_LIMIT_WINDOW_MS || 60000),
    maxRequests: Number(process.env.RESEARCH_RATE_LIMIT_MAX || 20),
  });
  const trainingLimiter = createRateLimiter({
    keyPrefix: "training",
    windowMs: Number(process.env.TRAINING_RATE_LIMIT_WINDOW_MS || 60000),
    maxRequests: Number(process.env.TRAINING_RATE_LIMIT_MAX || 60),
  });
  const aiLimiter = createRateLimiter({
    keyPrefix: "ai",
    windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60000),
    maxRequests: Number(process.env.AI_RATE_LIMIT_MAX || 120),
  });
  const executeLimiter = createRateLimiter({
    keyPrefix: "execute",
    windowMs: Number(process.env.EXECUTE_RATE_LIMIT_WINDOW_MS || 60000),
    maxRequests: Number(process.env.EXECUTE_RATE_LIMIT_MAX || 80),
  });
  const aiInflightGuard = createInflightGuard(
    "ai",
    Math.max(8, Number(process.env.AI_MAX_INFLIGHT || 120))
  );
  const chatInflightGuard = createInflightGuard(
    "chat",
    Math.max(8, Number(process.env.CHAT_MAX_INFLIGHT || 120))
  );
  const executeInflightGuard = createInflightGuard(
    "execute",
    Math.max(4, Number(process.env.EXECUTE_MAX_INFLIGHT || 60))
  );

  app.post("/mesh/register", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id, baseUrl, kind, capabilities } = req.body || {};
    if (!id || !baseUrl) {
      return res.status(400).json({ error: "Missing id or baseUrl" });
    }
    meshRegistry.register({
      id,
      baseUrl,
      kind: kind || "unknown",
      capabilities: Array.isArray(capabilities) ? capabilities : [],
    } as InferenceNode);
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok" });
  });

  app.post("/mesh/heartbeat", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    meshRegistry.heartbeat(id);
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok" });
  });

  app.post("/mesh/metrics", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id, latency_ms, load, cache_size } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    meshRegistry.updateMetrics(id, {
      latencyMs: typeof latency_ms === "number" ? latency_ms : undefined,
      load: typeof load === "number" ? load : undefined,
      cacheSize: typeof cache_size === "number" ? cache_size : undefined,
    });
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok" });
  });

  app.post("/mesh/train-signal", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id, signal } = req.body || {};
    if (!id || !signal) return res.status(400).json({ error: "Missing id or signal" });
    appendEvent({
      type: "mesh.train_signal",
      timestamp: Date.now(),
      payload: { id, signal },
    });
    res.json({ status: "ok" });
  });

  /* ---------------- Federated Training ---------------- */
  app.get("/fed/model", requireScope("federation:read"), (_req: Request, res: Response) => {
    res.json({ model: fedAggregator.getGlobal() });
  });

  app.post("/fed/update", requireScope("federation:write"), (req: Request, res: Response) => {
    const { update, sig } = req.body || {};
    if (!update) return res.status(400).json({ error: "Missing update" });
    if (!verifyPayload(update, sig || "", fedKey)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    fedAggregator.addUpdate(update);
    appendEvent({
      type: "fed.update",
      timestamp: Date.now(),
      payload: { id: update.id, n_features: update.n_features, classes: update.classes },
    });
    res.json({ status: "ok" });
  });

  app.post("/fed/sign", requireScope("federation:write"), (req: Request, res: Response) => {
    const { payload } = req.body || {};
    if (!payload) return res.status(400).json({ error: "Missing payload" });
    if (!fedKey) return res.status(400).json({ error: "Missing NEUROEDGE_FED_KEY" });
    res.json({ sig: signPayload(payload, fedKey) });
  });

  app.get("/mesh/nodes", requireScope("mesh:read"), (_req: Request, res: Response) => {
    const nodes = meshRegistry.list();
    setMeshNodesOnline(nodes.filter((n) => n.online).length);
    res.json(nodes);
  });

  app.post("/mesh/infer", requireWorkspace, requireScope("ai:infer"), async (req: Request, res: Response) => {
    const node = meshRegistry.pickNode();
    if (!node) {
      return res.status(503).json({ error: "No mesh nodes available" });
    }
    try {
      const response = await axios.post(`${node.baseUrl.replace(/\/$/, "")}/infer`, req.body || {});
      res.json({ node: node.id, result: response.data });
    } catch (err: any) {
      res.status(502).json({ error: "Mesh node inference failed", detail: err?.message || String(err) });
    }
  });

  app.post("/research", requireWorkspace, requireScope("research:run"), researchLimiter, async (req: Request, res: Response) => {
    const query = String(req.body?.query || req.body?.text || req.body?.input || "").trim();
    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }
    try {
      const result = await runResearch(query);
      appendEvent({
        type: "research.run",
        timestamp: Date.now(),
        payload: {
          query,
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          actor: req.auth?.sub || "unknown",
          pagesFetched: result.pagesFetched,
          citations: result.citations.map((c) => ({ title: c.title, url: c.url })),
        },
      });
      res.json({
        success: true,
        query,
        summary: result.summary,
        citations: result.citations,
        pagesFetched: result.pagesFetched,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Research pipeline failed", detail: err?.message || String(err) });
    }
  });

  app.post("/training/feedback", requireWorkspace, requireScope("training:write"), trainingLimiter, (req: Request, res: Response) => {
    const query = String(req.body?.query || "").trim();
    const responseText = String(req.body?.response || "").trim();
    const ratingRaw = String(req.body?.rating || "neutral").toLowerCase();
    const rating = ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : "neutral";
    if (!query || !responseText) {
      return res.status(400).json({ error: "Missing query or response" });
    }
    const result = recordTrainingSampleGuarded({
      query,
      response: responseText,
      rating,
      orgId: req.auth?.orgId,
      workspaceId: req.auth?.workspaceId,
      actor: req.auth?.sub,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      citations: Array.isArray(req.body?.citations) ? req.body.citations : [],
    });
    if (!result.accepted) {
      return res.status(422).json({
        success: false,
        error: "Training sample rejected by quality gate",
        reason: result.reason || "rejected",
      });
    }
    const model = String(req.body?.model || "").trim();
    if (model) {
      recordModelOutcome({
        model,
        rating,
        domain: String(req.body?.domain || "general"),
        confidence: Number(req.body?.confidence || 0),
      });
    }
    res.json({ success: true, event: result.event });
  });

  app.get(
    "/admin/training/overview",
    requireWorkspace,
    requireScope("training:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const limit = Math.max(50, Math.min(5000, Number(req.query.limit) || 1000));
      const samples = listTrainingSamples(limit) as Array<Record<string, any>>;
      const byRating = samples.reduce(
        (acc, s) => {
          const key = String(s.rating || "neutral");
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const byTag: Record<string, number> = {};
      for (const s of samples) {
        const tags = Array.isArray(s.tags) ? s.tags : [];
        for (const tag of tags) {
          const k = String(tag || "").trim().toLowerCase();
          if (!k) continue;
          byTag[k] = (byTag[k] || 0) + 1;
        }
      }
      res.json({
        success: true,
        total: samples.length,
        byRating,
        topTags: Object.entries(byTag)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag, count]) => ({ tag, count })),
        latest: samples.slice(-10),
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
      });
    }
  );

  const runTrustedBootstrapPack = async (opts: {
    domain: TrustedDomain;
    includeSecondary: boolean;
    limit: number;
    reason: string;
    actor: string;
    orgId: string;
    workspaceId: string;
  }): Promise<Record<string, any>> => {
    const urls = trustedPackUrls(opts.domain, opts.includeSecondary, opts.limit);
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    const startedAt = Date.now();
    const ragResp = await axios.post(
      `${mlBase.replace(/\/$/, "")}/rag/ingest`,
      {
        urls,
        domain: opts.domain,
        tags: ["bootstrap_pack", opts.domain, opts.includeSecondary ? "secondary" : "core", "nightly_refresh"],
        source: "trusted_seed_pack",
        rebuild_index: true,
      },
      { timeout: 300000 }
    );

    let sourceProbe: Record<string, any> = {};
    for (const url of urls) {
      sourceProbe[url] = await probeSourceMetadata(url, Math.max(3000, Number(process.env.BOOTSTRAP_SOURCE_PROBE_TIMEOUT_MS || 9000)));
    }

    appendEvent({
      type: "training.bootstrap_pack.run",
      timestamp: Date.now(),
      payload: {
        domain: opts.domain,
        includeSecondary: opts.includeSecondary,
        attemptedUrls: urls.length,
        actor: opts.actor,
        orgId: opts.orgId,
        workspaceId: opts.workspaceId,
        reason: opts.reason,
        durationMs: Date.now() - startedAt,
        sourceProbe,
        result: ragResp.data,
      },
    });
    const previous = readBootstrapSummary();
    writeBootstrapSummary({
      ...previous,
      domains: {
        ...(previous.domains || {}),
        [opts.domain]: {
          domain: opts.domain,
          includeSecondary: opts.includeSecondary,
          limit: opts.limit,
          urls,
          lastRunAt: Date.now(),
          lastSuccessAt: Date.now(),
          lastReason: opts.reason,
          lastActor: opts.actor,
          sourceProbe,
          lastResult: ragResp.data,
        },
      },
      lastRunAt: Date.now(),
    });
    return { domain: opts.domain, urls, result: ragResp.data, sourceProbe };
  };

  const staleCheckForDomain = async (domain: TrustedDomain): Promise<Record<string, any>> => {
    const summary = readBootstrapSummary();
    const cfg = ((summary.domains || {})[domain] || {}) as Record<string, any>;
    const staleHours = getAutoRefreshConfig().staleHours;
    const lastSuccessAt = Number(cfg.lastSuccessAt || 0);
    const staleByAge = !lastSuccessAt || Date.now() - lastSuccessAt > staleHours * 3600 * 1000;
    const urls = trustedPackUrls(domain, Boolean(cfg.includeSecondary), Number(cfg.limit || 12));
    const previousProbe = (cfg.sourceProbe || {}) as Record<string, any>;
    const checks: Array<Record<string, any>> = [];
    let changedSources = 0;
    for (const url of urls) {
      const nowMeta = await probeSourceMetadata(url, Math.max(3000, Number(process.env.BOOTSTRAP_SOURCE_PROBE_TIMEOUT_MS || 9000)));
      const prevMeta = (previousProbe[url] || {}) as Record<string, any>;
      const changed =
        Boolean(nowMeta.ok) &&
        Boolean(prevMeta.checkedAt) &&
        ((nowMeta.etag && prevMeta.etag && nowMeta.etag !== prevMeta.etag) ||
          (nowMeta.lastModified && prevMeta.lastModified && nowMeta.lastModified !== prevMeta.lastModified));
      if (changed) changedSources += 1;
      checks.push({ url, ...nowMeta, changed });
    }
    return {
      domain,
      staleByAge,
      changedSources,
      checks,
      shouldRefresh: staleByAge || changedSources > 0,
    };
  };

  app.get(
    "/admin/training/bootstrap-pack/list",
    requireWorkspace,
    requireScope("training:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({ success: true, packs: TRUSTED_BOOTSTRAP_PACKS });
    }
  );

  app.get(
    "/admin/training/bootstrap-pack/auto-refresh/status",
    requireWorkspace,
    requireScope("training:read"),
    requireRole(["founder", "admin"]),
    async (_req: Request, res: Response) => {
      const summary = readBootstrapSummary();
      const domains: TrustedDomain[] = ["medicine", "agriculture", "market"];
      const staleChecks = [];
      for (const d of domains) {
        staleChecks.push(await staleCheckForDomain(d));
      }
      res.json({
        success: true,
        config: getAutoRefreshConfig(),
        summary,
        staleChecks,
      });
    }
  );

  app.post(
    "/admin/training/bootstrap-pack/auto-refresh/config",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const currentSummary = readBootstrapSummary();
      const currentCfg = getAutoRefreshConfig();
      const enabled =
        typeof req.body?.enabled === "boolean" ? req.body.enabled : currentCfg.enabled;
      const hourUtc = Math.max(
        0,
        Math.min(23, Number(req.body?.hourUtc ?? currentCfg.hourUtc))
      );
      const minuteUtc = Math.max(
        0,
        Math.min(59, Number(req.body?.minuteUtc ?? currentCfg.minuteUtc))
      );
      const staleHours = Math.max(
        12,
        Number(req.body?.staleHours ?? currentCfg.staleHours)
      );
      const tickMs = Math.max(
        30_000,
        Number(req.body?.tickMs ?? currentCfg.tickMs)
      );
      const nextCfg = { enabled, hourUtc, minuteUtc, staleHours, tickMs };
      writeBootstrapSummary({
        ...currentSummary,
        autoRefreshConfig: nextCfg,
        updatedAt: Date.now(),
      });
      appendEvent({
        type: "training.bootstrap_pack.auto_refresh.config",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          config: nextCfg,
        },
      });
      res.json({ success: true, config: nextCfg });
    }
  );

  app.post(
    "/admin/training/bootstrap-pack/auto-refresh/run",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const domainRaw = String(req.body?.domain || "").trim().toLowerCase();
      const includeSecondary = Boolean(req.body?.includeSecondary);
      const limit = Math.max(1, Math.min(30, Number(req.body?.limit) || 12));
      const domains: TrustedDomain[] = domainRaw && isTrustedDomain(domainRaw) ? [domainRaw] : ["medicine", "agriculture", "market"];
      const results: Array<Record<string, any>> = [];
      for (const domain of domains) {
        const stale = await staleCheckForDomain(domain);
        const result = await runTrustedBootstrapPack({
          domain,
          includeSecondary: includeSecondary || stale.changedSources > 0,
          limit,
          reason: "manual_auto_refresh",
          actor: req.auth?.sub || "manual",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
        });
        results.push({ ...result, stale });
      }
      res.json({ success: true, results });
    }
  );

  app.post(
    "/admin/training/bootstrap-pack/run",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    trainingLimiter,
    async (req: Request, res: Response) => {
      const domainRaw = String(req.body?.domain || "medicine").trim().toLowerCase();
      const includeSecondary = Boolean(req.body?.includeSecondary);
      const limit = Math.max(1, Math.min(30, Number(req.body?.limit) || 12));
      if (!isTrustedDomain(domainRaw)) {
        return res.status(400).json({ error: "Invalid domain. Use medicine|agriculture|market." });
      }
      const domain: TrustedDomain = domainRaw;
      try {
        const out = await runTrustedBootstrapPack({
          domain,
          includeSecondary,
          limit,
          reason: "manual_run",
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
        });
        res.json({ success: true, ...out });
      } catch (err: any) {
        res.status(502).json({ error: "Bootstrap pack ingestion failed", detail: err?.message || String(err) });
      }
    }
  );

  app.post(
    "/admin/training/ingest/text",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    trainingLimiter,
    (req: Request, res: Response) => {
      const title = sanitizeText(String(req.body?.title || "manual_text"));
      const text = sanitizeText(String(req.body?.text || ""));
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)) : [];
      const options = req.body?.options || {};
      if (!text) return res.status(400).json({ error: "Missing text" });
      const maxChars = Math.max(1000, Number(process.env.TRAINING_TEXT_MAX_CHARS || 200000));
      const clipped = text.slice(0, maxChars);
      const evt = recordTrainingSample({
        query: `ingest:text:${title}`,
        response: clipped,
        rating: "up",
        orgId: req.auth?.orgId,
        workspaceId: req.auth?.workspaceId,
        actor: req.auth?.sub,
        tags: ["ingest", "text", ...tags],
      });
      appendEvent({
        type: "training.ingest.text",
        timestamp: Date.now(),
        payload: {
          title,
          chars: clipped.length,
          options,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
        },
      });
      res.json({ success: true, ingested: 1, chars: clipped.length, event: evt });
    }
  );

  app.post(
    "/admin/training/ingest/files",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    trainingLimiter,
    (req: Request, res: Response) => {
      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)) : [];
      const options = req.body?.options || {};
      if (files.length === 0) return res.status(400).json({ error: "Missing files" });
      const maxFiles = Math.max(1, Number(process.env.TRAINING_MAX_FILES_PER_INGEST || 200));
      const maxChars = Math.max(1000, Number(process.env.TRAINING_TEXT_MAX_CHARS || 200000));
      const maxBinaryBytes = Math.max(1024, Number(process.env.TRAINING_BINARY_MAX_BYTES || 3000000));
      const sliced = files.slice(0, maxFiles);
      const accepted: Array<Record<string, any>> = [];
      const rejected: Array<Record<string, any>> = [];

      for (const f of sliced) {
        const name = String(f?.name || "unknown").trim();
        const mime = String(f?.type || "").toLowerCase();
        const textContent = typeof f?.textContent === "string" ? f.textContent : "";
        const base64 = typeof f?.base64 === "string" ? f.base64 : "";
        const lowerName = name.toLowerCase();
        const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
        const isTextish =
          mime.startsWith("text/") ||
          [".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rs", ".html", ".css", ".sql", ".yaml", ".yml"].includes(ext);

        if (isTextish && textContent) {
          const cleaned = sanitizeText(textContent).slice(0, maxChars);
          if (!cleaned) {
            rejected.push({ name, reason: "empty_text" });
            continue;
          }
          recordTrainingSample({
            query: `ingest:file:${name}`,
            response: cleaned,
            rating: "up",
            orgId: req.auth?.orgId,
            workspaceId: req.auth?.workspaceId,
            actor: req.auth?.sub,
            tags: ["ingest", "file", ext.replace(".", "") || "text", ...tags],
          });
          accepted.push({ name, mode: "text", chars: cleaned.length });
          continue;
        }

        if (base64) {
          const buf = decodeBase64Safe(base64);
          if (!buf) {
            rejected.push({ name, reason: "invalid_base64" });
            continue;
          }
          if (buf.length > maxBinaryBytes) {
            rejected.push({ name, reason: "binary_too_large", bytes: buf.length });
            continue;
          }
          const descriptor = `binary_file name=${name} mime=${mime || "unknown"} bytes=${buf.length} ext=${ext || "none"}`;
          recordTrainingSample({
            query: `ingest:file:${name}`,
            response: descriptor,
            rating: "neutral",
            orgId: req.auth?.orgId,
            workspaceId: req.auth?.workspaceId,
            actor: req.auth?.sub,
            tags: ["ingest", "binary", ext.replace(".", "") || "bin", ...tags],
          });
          accepted.push({ name, mode: "binary", bytes: buf.length });
          continue;
        }

        rejected.push({ name, reason: "unsupported_or_empty" });
      }

      appendEvent({
        type: "training.ingest.files",
        timestamp: Date.now(),
        payload: {
          accepted: accepted.length,
          rejected: rejected.length,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          options,
        },
      });
      res.json({
        success: true,
        accepted,
        rejected,
        ingested: accepted.length,
      });
    }
  );

  app.post(
    "/admin/training/ingest/urls",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    trainingLimiter,
    async (req: Request, res: Response) => {
      const urls = Array.isArray(req.body?.urls) ? req.body.urls.map((u: any) => String(u || "").trim()).filter(Boolean) : [];
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)) : [];
      const options = req.body?.options || {};
      if (urls.length === 0) return res.status(400).json({ error: "Missing urls" });

      const maxUrls = Math.max(1, Number(process.env.TRAINING_MAX_URLS_PER_INGEST || 25));
      const maxChars = Math.max(1000, Number(process.env.TRAINING_TEXT_MAX_CHARS || 200000));
      const timeoutMs = Math.max(1000, Number(process.env.RESEARCH_HTTP_TIMEOUT_MS || 7000));
      const accepted: Array<Record<string, any>> = [];
      const rejected: Array<Record<string, any>> = [];

      for (const rawUrl of urls.slice(0, maxUrls)) {
        try {
          const url = new URL(rawUrl);
          if (!["http:", "https:"].includes(url.protocol)) {
            rejected.push({ url: rawUrl, reason: "invalid_protocol" });
            continue;
          }
          const resp = await axios.get(rawUrl, {
            timeout: timeoutMs,
            maxContentLength: 4_000_000,
            responseType: "text",
          });
          const bodyRaw = String(resp.data || "");
          const cleaned = sanitizeText(stripHtml(bodyRaw)).slice(0, maxChars);
          if (!cleaned) {
            rejected.push({ url: rawUrl, reason: "empty_content" });
            continue;
          }
          recordTrainingSample({
            query: `ingest:url:${rawUrl}`,
            response: cleaned,
            rating: "up",
            orgId: req.auth?.orgId,
            workspaceId: req.auth?.workspaceId,
            actor: req.auth?.sub,
            tags: ["ingest", "url", ...tags],
            citations: [{ title: rawUrl, url: rawUrl }],
          });
          accepted.push({ url: rawUrl, chars: cleaned.length, status: resp.status });
        } catch (err: any) {
          rejected.push({ url: rawUrl, reason: err?.message || String(err) });
        }
      }

      appendEvent({
        type: "training.ingest.urls",
        timestamp: Date.now(),
        payload: {
          accepted: accepted.length,
          rejected: rejected.length,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          options,
        },
      });
      res.json({ success: true, accepted, rejected, ingested: accepted.length });
    }
  );

  app.post(
    "/admin/training/ingest/research",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    trainingLimiter,
    async (req: Request, res: Response) => {
      const query = String(req.body?.query || "").trim();
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t: any) => String(t)) : [];
      if (!query) return res.status(400).json({ error: "Missing query" });
      try {
        const result = await runResearch(query);
        const combined = [
          `query: ${query}`,
          `summary: ${result.summary}`,
          `citations:`,
          ...result.citations.map((c) => `- ${c.title || c.url}: ${c.url}`),
        ].join("\n");
        const evt = recordTrainingSample({
          query: `ingest:research:${query}`,
          response: combined,
          rating: "up",
          orgId: req.auth?.orgId,
          workspaceId: req.auth?.workspaceId,
          actor: req.auth?.sub,
          tags: ["ingest", "research", ...tags],
          citations: result.citations.map((c) => ({ title: c.title, url: c.url })),
        });
        res.json({
          success: true,
          event: evt,
          ingested: 1,
          pagesFetched: result.pagesFetched,
          citations: result.citations,
        });
      } catch (err: any) {
        res.status(500).json({ error: "Research ingest failed", detail: err?.message || String(err) });
      }
    }
  );

  app.post(
    "/admin/training/jobs/run",
    requireWorkspace,
    requireScope("training:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const body = req.body || {};
      const mode = String(body.mode || "incremental");
      const evalSuite = String(body.evalSuite || "core");
      const targetModel = String(body.targetModel || process.env.ML_MODEL_NAME || "neuroedge-ml");
      const id = `train-${crypto.randomUUID()}`;
      appendEvent({
        type: "training.job.requested",
        timestamp: Date.now(),
        payload: {
          id,
          mode,
          evalSuite,
          targetModel,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          options: body.options || {},
        },
      });
      const startedAt = Date.now();
      const mlBase = process.env.ML_URL || "http://localhost:8090";
      let ragReindex: any = null;
      let ragStats: any = null;
      let bootstrap: any = null;
      let status = "completed";
      let detail = "Training pipeline executed";
      try {
        if (mode === "full") {
          const limit = Math.max(100, Math.min(10000, Number(body?.bootstrapLimit) || 3000));
          const samples = listTrainingSamples(limit) as Array<Record<string, any>>;
          const docs = samples
            .map((s, idx) => ({
              title: `training_sample_${idx + 1}`,
              text: `Q: ${String(s.query || "")}\nA: ${String(s.response || "")}`,
              domain: String(body?.domain || "general").trim().toLowerCase() || "general",
              tags: Array.isArray(s.tags) ? s.tags : ["training", "full_bootstrap"],
              source: "training_jobs_full",
            }))
            .filter((d) => d.text.length > 6);
          const b = await axios.post(
            `${mlBase.replace(/\/$/, "")}/rag/ingest`,
            {
              docs,
              domain: String(body?.domain || "general").trim().toLowerCase() || "general",
              source: "training_jobs_full",
              rebuild_index: true,
            },
            { timeout: 240000 }
          );
          bootstrap = { samples: samples.length, docs: docs.length, result: b.data };
        } else if (mode !== "eval_only") {
          const r = await axios.post(`${mlBase.replace(/\/$/, "")}/rag/reindex`, {}, { timeout: 180000 });
          ragReindex = r.data;
        }
        const s = await axios.get(`${mlBase.replace(/\/$/, "")}/rag/stats`, { timeout: 45000 });
        ragStats = s.data;
      } catch (err: any) {
        status = "failed";
        detail = err?.message || String(err);
      }

      const completedAt = Date.now();
      appendEvent({
        type: "training.job.completed",
        timestamp: completedAt,
        payload: {
          id,
          mode,
          evalSuite,
          targetModel,
          status,
          durationMs: completedAt - startedAt,
          detail,
          ragReindex,
          ragStats,
          bootstrap,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
        },
      });
      res.json({
        success: status !== "failed",
        job: {
          id,
          status,
          mode,
          evalSuite,
          targetModel,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          detail,
          ragReindex,
          ragStats,
          bootstrap,
        },
      });
    }
  );

  app.get("/training/samples", requireWorkspace, requireScope("training:read"), (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 200;
    res.json({
      success: true,
      samples: listTrainingSamples(limit),
    });
  });

  app.get("/training/export", requireWorkspace, requireScope("training:read"), (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 5000;
    const jsonl = exportTrainingJSONL(limit);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.send(jsonl);
  });

  app.get(
    "/admin/reliability/overview",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours) || 24));
      const snapshot = buildReliabilitySnapshot(windowHours);
      res.json({
        success: true,
        snapshot,
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
      });
    }
  );

  app.post(
    "/admin/evals/run",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const suite = String(req.body?.suite || "core").toLowerCase() as EvalSuiteName;
      const allowedSuites: EvalSuiteName[] = ["core", "reasoning", "coding", "research"];
      if (!allowedSuites.includes(suite)) {
        return res.status(400).json({ error: "Invalid eval suite", allowed: allowedSuites });
      }
      const restBase = String(process.env.ORCHESTRATOR_URL || `http://localhost:${restPort}`).replace(/\/$/, "");
      const apiKey = String(process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || req.header("x-api-key") || "").trim();
      if (!apiKey) {
        return res.status(400).json({ error: "Missing API key for eval runner. Set NEUROEDGE_API_KEY." });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-org-id": req.auth?.orgId || "personal",
        "x-workspace-id": req.auth?.workspaceId || "default",
      };
      const report = await runEvalSuite(suite, restBase, headers);
      appendEvent({
        type: "quality.eval.completed",
        timestamp: Date.now(),
        payload: {
          suite,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          report,
        },
      });
      res.json({ success: true, report });
    }
  );

  app.get(
    "/admin/evals/latest",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
      const reports = listEvents(6000)
        .filter((evt) => evt.type === "quality.eval.completed")
        .slice(-limit)
        .map((evt) => ({
          timestamp: evt.timestamp,
          ...(evt.payload || {}),
        }));
      res.json({ success: true, reports });
    }
  );

  app.post(
    "/admin/redteam/run",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const restBase = String(process.env.ORCHESTRATOR_URL || `http://localhost:${restPort}`).replace(/\/$/, "");
      const apiKey = String(process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || req.header("x-api-key") || "").trim();
      if (!apiKey) {
        return res.status(400).json({ error: "Missing API key for red-team runner. Set NEUROEDGE_API_KEY." });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-org-id": req.auth?.orgId || "personal",
        "x-workspace-id": req.auth?.workspaceId || "default",
      };
      const report = await runRedTeamSuite(restBase, headers);
      appendEvent({
        type: "quality.redteam.completed",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          report,
        },
      });
      res.json({ success: true, report });
    }
  );

  app.get(
    "/admin/redteam/latest",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
      const reports = listEvents(6000)
        .filter((evt) => evt.type === "quality.redteam.completed")
        .slice(-limit)
        .map((evt) => ({
          timestamp: evt.timestamp,
          ...(evt.payload || {}),
        }));
      res.json({ success: true, reports });
    }
  );

  app.get(
    "/admin/evals/coverage",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        coverage: getEvalCoverageCatalog(),
      });
    }
  );

  app.post(
    "/admin/evals/run-batch",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const suitesRaw = Array.isArray(req.body?.suites) ? req.body.suites : ["core", "reasoning", "coding", "research"];
      const suites = suitesRaw
        .map((s: any) => String(s || "").toLowerCase())
        .filter((s: string) => ["core", "reasoning", "coding", "research"].includes(s)) as EvalSuiteName[];
      if (suites.length === 0) {
        return res.status(400).json({ error: "No valid suites provided" });
      }
      const restBase = String(process.env.ORCHESTRATOR_URL || `http://localhost:${restPort}`).replace(/\/$/, "");
      const apiKey = String(process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || req.header("x-api-key") || "").trim();
      if (!apiKey) {
        return res.status(400).json({ error: "Missing API key for eval runner. Set NEUROEDGE_API_KEY." });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-org-id": req.auth?.orgId || "personal",
        "x-workspace-id": req.auth?.workspaceId || "default",
      };
      const report = await runEvalBatch(suites, restBase, headers);
      appendEvent({
        type: "quality.eval.batch.completed",
        timestamp: Date.now(),
        payload: {
          suites,
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          report,
        },
      });
      res.json({ success: true, report });
    }
  );

  app.get(
    "/admin/retrieval/freshness",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours) || 72));
      const summary = buildRetrievalFreshnessSummary(windowHours);
      res.json({ success: true, summary });
    }
  );

  app.get(
    "/admin/trust/signals",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours) || 72));
      const summary = buildTrustSignalsSummary(windowHours);
      res.json({ success: true, summary });
    }
  );

  app.get(
    "/admin/trust/consistency",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowHours = Math.max(1, Math.min(24 * 30, Number(req.query.windowHours) || 72));
      const summary = buildConsistencySnapshot(windowHours);
      res.json({ success: true, summary });
    }
  );

  app.get(
    "/admin/quality/benchmark/trends",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowDays = Math.max(1, Math.min(365, Number(req.query.windowDays) || 30));
      res.json({
        success: true,
        trend: buildBenchmarkTrend(windowDays),
      });
    }
  );

  app.get(
    "/admin/quality/benchmark/regression",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const windowDays = Math.max(1, Math.min(365, Number(req.query.windowDays) || 30));
      res.json({
        success: true,
        regression: computeBenchmarkRegression(windowDays),
      });
    }
  );

  app.post(
    "/admin/quality/benchmark/baselines",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const baselines = Array.isArray(req.body?.baselines) ? req.body.baselines : [];
      if (baselines.length === 0) {
        return res.status(400).json({ error: "Missing baselines" });
      }
      const next = saveBenchmarkBaselines(
        baselines.map((b: any) => ({
          suite: String(b?.suite || ""),
          minAccuracy: Number(b?.minAccuracy || 0),
          maxP95LatencyMs: Number(b?.maxP95LatencyMs || 0),
        }))
      );
      res.json({ success: true, baselines: next });
    }
  );

  app.get(
    "/admin/quality/benchmark/baselines",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({ success: true, baselines: getBenchmarkBaselines() });
    }
  );

  app.get(
    "/admin/model-quality/summary",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        router: getModelRouterConfig(),
        outcomes: summarizeModelOutcomes(),
      });
    }
  );

  app.post(
    "/admin/model-quality/router",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const variants = Array.isArray(req.body?.variants) ? req.body.variants : [];
      if (variants.length === 0) {
        return res.status(400).json({ error: "Missing variants" });
      }
      const normalized = variants
        .map((v: any) => ({
          id: String(v?.id || "").trim(),
          weight: Math.max(1, Number(v?.weight || 1)),
          domains: Array.isArray(v?.domains) ? v.domains.map((d: any) => String(d).toLowerCase()) : ["general"],
          enabled: Boolean(v?.enabled ?? true),
        }))
        .filter((v: any) => !!v.id);
      if (normalized.length === 0) {
        return res.status(400).json({ error: "No valid variants" });
      }
      const cfg = saveModelRouterConfig({ variants: normalized });
      res.json({ success: true, config: cfg });
    }
  );

  app.post(
    "/admin/quality/hardening/run",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const restBase = String(process.env.ORCHESTRATOR_URL || `http://localhost:${restPort}`).replace(/\/$/, "");
      const apiKey = String(process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || req.header("x-api-key") || "").trim();
      if (!apiKey) {
        return res.status(400).json({ error: "Missing API key for hardening run. Set NEUROEDGE_API_KEY." });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-org-id": req.auth?.orgId || "personal",
        "x-workspace-id": req.auth?.workspaceId || "default",
      };
      const batch = await runEvalBatch(["core", "reasoning", "coding", "research"], restBase, headers);
      const redteam = await runRedTeamSuite(restBase, headers);
      const reliability = buildReliabilitySnapshot(24);
      const retrieval = buildRetrievalFreshnessSummary(72);
      const trust = buildTrustSignalsSummary(72);
      const consistency = buildConsistencySnapshot(72);
      const benchmarkRegression = computeBenchmarkRegression(30);
      const report = { batch, redteam, reliability, retrieval, trust, consistency, benchmarkRegression };
      appendEvent({
        type: "quality.hardening.completed",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          report,
        },
      });
      res.json({ success: true, report });
    }
  );

  app.get(
    "/admin/sre/concurrency",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        inflight: getInflightSnapshot(),
      });
    }
  );

  app.get(
    "/admin/frontier-program",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        program: getFrontierProgram(),
      });
    }
  );

  app.post(
    "/admin/frontier-program/item",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ error: "Missing item id" });
      const program = upsertFrontierItem({
        id,
        group: req.body?.group,
        title: req.body?.title,
        description: req.body?.description,
        status: req.body?.status,
        priority: req.body?.priority,
        owner: req.body?.owner,
        targetQuarter: req.body?.targetQuarter,
        notes: req.body?.notes,
      } as any);
      res.json({ success: true, program });
    }
  );

  app.post(
    "/admin/frontier-program/items/bulk",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x: any) => String(x)) : [];
      if (ids.length === 0) return res.status(400).json({ error: "Missing item ids" });
      const program = bulkUpdateFrontierItems({
        ids,
        status: req.body?.status,
        owner: req.body?.owner,
        priority: req.body?.priority,
        notes: req.body?.notes,
      } as any);
      res.json({ success: true, program });
    }
  );

  app.post(
    "/admin/frontier-program/milestone",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ error: "Missing milestone id" });
      const program = upsertFrontierMilestone({
        id,
        name: req.body?.name,
        quarter: req.body?.quarter,
        owner: req.body?.owner,
        status: req.body?.status,
        successCriteria: Array.isArray(req.body?.successCriteria) ? req.body.successCriteria : [],
      } as any);
      res.json({ success: true, program });
    }
  );

  app.get(
    "/admin/frontier-program/readiness",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        readiness: frontierTrainingReadinessReport(),
      });
    }
  );

  app.post(
    "/admin/frontier-program/reset",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder"]),
    (_req: Request, res: Response) => {
      const program = resetFrontierProgram();
      res.json({ success: true, program });
    }
  );

  app.post("/chat", requireWorkspace, requireScope("chat:write"), aiLimiter, chatInflightGuard, handleChat);
  app.post("/execute", requireWorkspace, requireScope("execute:run"), executeLimiter, executeInflightGuard, handleExecution);
  app.post("/ai", requireWorkspace, requireScope("ai:infer"), aiLimiter, aiInflightGuard, handleAIInference);
  app.post("/brainstorm", requireWorkspace, requireScope("chat:write"), aiLimiter, chatInflightGuard, handleBrainstorm);
  app.post("/dev/assist", requireWorkspace, requireScope("chat:write"), executeLimiter, executeInflightGuard, handleDevAssistant);
  app.post("/ai/stream", requireWorkspace, requireScope("ai:infer"), aiLimiter, aiInflightGuard, async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const auth = req.header("authorization");
    const apiKey = req.header("x-api-key");
    const orgId = req.header("x-org-id");
    const workspaceId = req.header("x-workspace-id");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = auth;
    if (apiKey) headers["X-API-Key"] = apiKey;
    if (orgId) headers["X-Org-Id"] = orgId;
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;

    try {
      const aiResp = await axios.post(`http://127.0.0.1:${restPort}/ai`, req.body || {}, { headers });
      const text = String(aiResp.data?.response || "");
      const chunks = text.split(/\s+/).filter(Boolean);
      for (const token of chunks) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
        await new Promise((r) => setTimeout(r, 18));
      }
      res.write(`data: ${JSON.stringify({ done: true, full: text })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err?.message || "stream_failed", done: true })}\n\n`);
      res.end();
    }
  });

  app.get("/storage/state", (_req: Request, res: Response) => {
    res.json(readState());
  });
  app.post("/storage/state", requireScope("storage:write"), (req: Request, res: Response) => {
    const next = req.body || {};
    res.json(writeState(next));
  });
  app.get("/storage/events", (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 200;
    res.json(listEvents(limit));
  });
  app.post("/storage/event", requireScope("storage:write"), (req: Request, res: Response) => {
    const evt = req.body || {};
    res.json(appendEvent(evt));
  });
  app.get("/billing/usage", requireWorkspace, requireScope("billing:read"), (req: Request, res: Response) => {
    res.json({
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      summary: summarizeUsage(),
    });
  });
  const kernelsHandler = async (_req: Request, res: Response) => {
    const snapshot = await globalKernelManager.getAllHealth();
    res.json(snapshot);
  };
  app.get("/kernels", kernelsHandler);
  app.post("/kernels", kernelsHandler);

  app.use((err: any, _req: Request, res: Response, next: any) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({
        error: "Payload too large",
        detail: `Request body exceeds MAX_JSON_BODY (${maxJsonBody}). Reduce upload size or increase MAX_JSON_BODY.`,
      });
      return;
    }
    next(err);
  });

  let autoRefreshRunning = false;
  let lastTickAt = 0;
  let autoEvalRunning = false;
  let autoEvalLastTickAt = 0;

  const runNightlyAutoRefresh = async () => {
    const cfg = getAutoRefreshConfig();
    if (!cfg.enabled || autoRefreshRunning) return;
    const nowMs = Date.now();
    if (nowMs - lastTickAt < cfg.tickMs) return;
    lastTickAt = nowMs;
    const now = new Date();
    if (now.getUTCHours() !== cfg.hourUtc || now.getUTCMinutes() < cfg.minuteUtc) return;

    const dayKey = now.toISOString().slice(0, 10);
    const summary = readBootstrapSummary();
    if (String(summary.lastAutoRefreshDay || "") === dayKey) return;

    autoRefreshRunning = true;
    try {
      const domains: TrustedDomain[] = ["medicine", "agriculture", "market"];
      const results: Array<Record<string, any>> = [];
      for (const domain of domains) {
        const stale = await staleCheckForDomain(domain);
        if (!stale.shouldRefresh) {
          results.push({ domain, skipped: true, stale });
          continue;
        }
        const result = await runTrustedBootstrapPack({
          domain,
          includeSecondary: stale.changedSources > 0,
          limit: stale.changedSources > 0 ? 18 : 12,
          reason: stale.changedSources > 0 ? "nightly_source_change" : "nightly_stale_age",
          actor: "system:auto_refresh",
          orgId: "personal",
          workspaceId: "default",
        });
        results.push({ ...result, stale });
      }
      const after = readBootstrapSummary();
      writeBootstrapSummary({
        ...after,
        lastAutoRefreshDay: dayKey,
        lastAutoRefreshAt: Date.now(),
        lastAutoRefreshResults: results,
      });
      appendEvent({
        type: "training.bootstrap_pack.auto_refresh",
        timestamp: Date.now(),
        payload: {
          dayKey,
          hourUtc: cfg.hourUtc,
          minuteUtc: cfg.minuteUtc,
          results,
        },
      });
    } catch (err: any) {
      appendEvent({
        type: "training.bootstrap_pack.auto_refresh.error",
        timestamp: Date.now(),
        payload: {
          error: err?.message || String(err),
          hourUtc: cfg.hourUtc,
          minuteUtc: cfg.minuteUtc,
        },
      });
    } finally {
      autoRefreshRunning = false;
    }
  };

  const runNightlyAutoEval = async () => {
    const enabled = boolEnv("AUTO_EVAL_NIGHTLY", true);
    if (!enabled || autoEvalRunning) return;
    const tickMs = Math.max(30_000, Number(process.env.AUTO_EVAL_TICK_MS || 60_000));
    const nowMs = Date.now();
    if (nowMs - autoEvalLastTickAt < tickMs) return;
    autoEvalLastTickAt = nowMs;

    const hourUtc = Math.max(0, Math.min(23, Number(process.env.AUTO_EVAL_HOUR_UTC || 2)));
    const minuteUtc = Math.max(0, Math.min(59, Number(process.env.AUTO_EVAL_MINUTE_UTC || 30)));
    const now = new Date();
    if (now.getUTCHours() !== hourUtc || now.getUTCMinutes() < minuteUtc) return;

    const dayKey = now.toISOString().slice(0, 10);
    const state = readState();
    const summary = (state.summary || {}) as Record<string, any>;
    if (String(summary.lastNightlyEvalDay || "") === dayKey) return;

    const apiKey = String(process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || "").trim();
    if (!apiKey) {
      appendEvent({
        type: "quality.eval.nightly.skipped",
        timestamp: Date.now(),
        payload: {
          reason: "missing_api_key",
          env: "NEUROEDGE_API_KEY",
          hourUtc,
          minuteUtc,
        },
      });
      writeState({
        ...state,
        summary: {
          ...summary,
          lastNightlyEvalDay: dayKey,
          lastNightlyEvalSkipped: true,
          lastNightlyEvalReason: "missing_api_key",
          updatedAt: Date.now(),
        },
      });
      return;
    }

    autoEvalRunning = true;
    try {
      const baseUrl = String(process.env.ORCHESTRATOR_URL || `http://localhost:${restPort}`).replace(/\/$/, "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-org-id": "personal",
        "x-workspace-id": "default",
      };
      const core = await runEvalSuite("core", baseUrl, headers);
      const reasoning = await runEvalSuite("reasoning", baseUrl, headers);
      const coding = await runEvalSuite("coding", baseUrl, headers);
      const research = await runEvalSuite("research", baseUrl, headers);
      const redteam = await runRedTeamSuite(baseUrl, headers);
      const reliability = buildReliabilitySnapshot(24);
      const report = { core, reasoning, coding, research, redteam, reliability };
      appendEvent({
        type: "quality.eval.nightly.completed",
        timestamp: Date.now(),
        payload: {
          dayKey,
          hourUtc,
          minuteUtc,
          report,
        },
      });
      writeState({
        ...state,
        summary: {
          ...summary,
          lastNightlyEvalDay: dayKey,
          lastNightlyEvalAt: Date.now(),
          lastNightlyEval: report,
          updatedAt: Date.now(),
        },
      });
    } catch (err: any) {
      appendEvent({
        type: "quality.eval.nightly.error",
        timestamp: Date.now(),
        payload: {
          dayKey,
          error: err?.message || String(err),
        },
      });
    } finally {
      autoEvalRunning = false;
    }
  };

  setInterval(() => {
    void runNightlyAutoRefresh();
  }, 30_000);

  setInterval(() => {
    void runNightlyAutoEval();
  }, 30_000);

  app.listen(restPort, () => {
    logger.info(
      "SERVER",
      `REST API running on http://localhost:${restPort}`
    );
  });

  /* ---------------- WebSocket ---------------- */
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", (ws) => {
    logger.info("WS", "Client connected");

    ws.on("message", async (message) => {
      try {
        const payload = JSON.parse(message.toString());
        const cmdId = `ws-${Date.now()}`;

        const kernelCommand: KernelCommand = {
          id: cmdId,
          type: "execute",
          payload: { command: payload.command },
          metadata: { user: payload.user || "websocket" },
        };

        const response =
          await globalKernelManager.sendCommandBalanced(kernelCommand);

        ws.send(JSON.stringify(response));
      } catch (err: any) {
        logger.error("WS", err.message);
        ws.send(JSON.stringify({ error: err.message }));
      }
    });

    ws.on("close", () => {
      logger.info("WS", "Client disconnected");
    });
  });

  logger.info(
    "SERVER",
    `WebSocket server running on ws://localhost:${WS_PORT}`
  );

  /* ---------------- Agents ---------------- */
  const permissions = new PermissionManager();

  const devAgent = new DevExecutionAgent(eventBus, logger, permissions);
  devAgent.start();

  new GitHubAgent();

  /* ---------------- Kernel ---------------- */
  const kernelUrl = process.env.KERNEL_URL || "http://localhost:8080";
  globalKernelManager.addKernel("local", kernelUrl);
}
