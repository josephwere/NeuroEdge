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
  getMarketReadinessConfig,
  updateMarketReadinessConfig,
} from "@quality/marketReadiness";
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
import {
  applySubmissionPatch,
  generateSubmissionPrDraft,
  getNeuroExpansionState,
  previewSubmissionPatch,
  mergeNeuroExpansionSubmission,
  reviewNeuroExpansionSubmission,
  runDailyNeuroExpansionPlanner,
  saveNeuroExpansionSettings,
  scanPlaceholderGaps,
  submitNeuroExpansion,
} from "@core/neuroExpansion";
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

function actorDashboardIdentity(req: Request): { userId: string; userName: string; orgId: string } {
  const record = findDashboardUserByActor(req);
  const fallbackSub = String(req.auth?.sub || "").trim();
  const fallbackEmail = actorEmail(req);
  const fallbackName = actorName(req) || "User";
  return {
    userId: String(record?.id || fallbackSub || fallbackEmail || "anonymous").trim().toLowerCase(),
    userName: String(record?.name || fallbackName || "User").trim(),
    orgId: String(req.auth?.orgId || record?.orgId || "personal"),
  };
}

function defaultOwnerComputePolicy() {
  return {
    meshDiscoveryEnabled: true,
    lowPowerMode: true,
    computeExecutionConsent: false,
    trainingConsent: false,
    backgroundOnly: true,
    updatedAt: Date.now(),
  };
}

function normalizeOwnerComputePolicy(input: Record<string, any> | null | undefined) {
  const base = defaultOwnerComputePolicy();
  const merged: Record<string, any> = { ...base, ...(input || {}) };
  return {
    userId: String(merged.userId || "").trim().toLowerCase(),
    userName: String(merged.userName || "").trim(),
    orgId: String(merged.orgId || "").trim(),
    meshDiscoveryEnabled: Boolean(merged.meshDiscoveryEnabled),
    lowPowerMode: Boolean(merged.lowPowerMode),
    computeExecutionConsent: Boolean(merged.computeExecutionConsent),
    trainingConsent: Boolean(merged.trainingConsent),
    backgroundOnly: Boolean(merged.backgroundOnly),
    updatedAt: Number(merged.updatedAt || Date.now()),
  };
}

function ownerEligibleForComputeRewards(policy: Record<string, any> | null | undefined): boolean {
  const p = normalizeOwnerComputePolicy(policy || {});
  return Boolean(p.computeExecutionConsent || p.trainingConsent);
}

function applyOwnerConsentToDevice(
  device: Record<string, any>,
  policy: Record<string, any> | null | undefined
): Record<string, any> {
  const p = normalizeOwnerComputePolicy(policy || {});
  const canCompute = Boolean(p.computeExecutionConsent);
  if (canCompute) {
    return {
      ...device,
      meshDiscoveryEnabled: p.meshDiscoveryEnabled,
      lowPowerMode: p.lowPowerMode,
      status: String(device.status || "") === "mesh_only" ? "active" : device.status,
      pauseReason:
        String(device.pauseReason || "") === "consent_required" ? "" : String(device.pauseReason || ""),
    };
  }
  return {
    ...device,
    computeEnabled: false,
    status: ["suspended", "paused"].includes(String(device.status || "")) ? device.status : "mesh_only",
    pauseReason: String(device.pauseReason || "consent_required"),
    meshDiscoveryEnabled: p.meshDiscoveryEnabled,
    lowPowerMode: p.lowPowerMode,
  };
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

function requireAnyScope(needs: string[]) {
  return (req: Request, res: Response, next: any) => {
    if (needs.some((s) => hasScope(req, s))) return next();
    return res.status(403).json({
      error: "Forbidden",
      missingAnyScope: needs,
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

function maskEmail(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  const [local, domain] = raw.split("@");
  if (!local || !domain) return "";
  if (local.length <= 2) return `${local[0] || "*"}*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(value: string): string {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  const tail = digits.slice(-4);
  return `***${tail}`;
}

function normalizePhone(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  return raw.replace(/\D/g, "");
}

function payoutPeriodBucket(periodRaw: string, now = new Date()): string {
  const period = String(periodRaw || "weekly").toLowerCase();
  const isoDate = now.toISOString().slice(0, 10);
  if (period === "hourly") return now.toISOString().slice(0, 13);
  if (period === "daily") return isoDate;
  if (period === "monthly") return now.toISOString().slice(0, 7);
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function applyComputeGuardrails(
  existing: Record<string, any>,
  statsInput: Record<string, any>,
  guardrails: Record<string, any>,
  now: number
): Record<string, any> {
  const nextStats = {
    ...(existing.stats || {}),
    cpuPct: Math.max(0, Math.min(100, Number(statsInput?.cpuPct ?? existing?.stats?.cpuPct ?? 0))),
    ramPct: Math.max(0, Math.min(100, Number(statsInput?.ramPct ?? existing?.stats?.ramPct ?? 0))),
    tempC: Math.max(0, Number(statsInput?.tempC ?? existing?.stats?.tempC ?? 0)),
    uptimeSec: Math.max(0, Number(statsInput?.uptimeSec ?? existing?.stats?.uptimeSec ?? 0)),
    tasksCompleted: Math.max(0, Number(statsInput?.tasksCompleted ?? existing?.stats?.tasksCompleted ?? 0)),
    computeHours: Math.max(0, Number(statsInput?.computeHours ?? existing?.stats?.computeHours ?? 0)),
    earningsUsd: Math.max(0, Number(statsInput?.earningsUsd ?? existing?.stats?.earningsUsd ?? 0)),
    earnedPoints: Math.max(0, Number(statsInput?.earnedPoints ?? existing?.stats?.earnedPoints ?? 0)),
    onBattery: Boolean(statsInput?.onBattery ?? existing?.stats?.onBattery ?? false),
    updatedAt: now,
  };
  const maxCpu = Math.max(5, Math.min(100, Number(guardrails?.maxCpuPct ?? 35)));
  const maxRam = Math.max(5, Math.min(100, Number(guardrails?.maxRamPct ?? 40)));
  const pauseTemp = Math.max(35, Math.min(120, Number(guardrails?.pauseOnHighTempC ?? 80)));
  const pauseOnBattery = Boolean(guardrails?.pauseOnBattery ?? true);
  const cpuHot = nextStats.cpuPct > maxCpu;
  const ramHot = nextStats.ramPct > maxRam;
  const tempHot = nextStats.tempC >= pauseTemp;
  const batteryPause = pauseOnBattery && nextStats.onBattery;
  const manualPause = String(existing.pauseReason || "") === "owner_paused";
  const suspended = String(existing.status || "") === "suspended";
  if (manualPause || suspended) {
    return { ...existing, stats: nextStats, updatedAt: now };
  }
  if (tempHot || batteryPause) {
    return {
      ...existing,
      stats: nextStats,
      status: "paused",
      computeEnabled: false,
      pauseReason: tempHot ? "auto_paused_high_temp" : "auto_paused_battery",
      lastTelemetryAt: now,
      updatedAt: now,
    };
  }
  if (cpuHot || ramHot) {
    return {
      ...existing,
      stats: nextStats,
      status: "throttled",
      computeEnabled: false,
      pauseReason: "auto_throttled_resource_guardrail",
      lastTelemetryAt: now,
      updatedAt: now,
    };
  }
  const wasAutoControlled =
    ["auto_paused_high_temp", "auto_paused_battery", "auto_throttled_resource_guardrail"].includes(
      String(existing.pauseReason || "")
    ) || ["paused", "throttled"].includes(String(existing.status || ""));
  if (wasAutoControlled) {
    return {
      ...existing,
      stats: nextStats,
      status: "active",
      computeEnabled: true,
      pauseReason: "",
      lastTelemetryAt: now,
      updatedAt: now,
    };
  }
  return { ...existing, stats: nextStats, lastTelemetryAt: now, updatedAt: now };
}

function parseDeviceLines(input: string): Array<Record<string, any>> {
  const text = String(input || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split(/[,\t|]/).map((p) => p.trim());
      return {
        externalId: String(parts[0] || `import-${Date.now()}-${i}`),
        model: String(parts[1] || "unknown"),
        serial: String(parts[2] || ""),
        imei: String(parts[3] || ""),
        ownerRef: String(parts[4] || ""),
      };
    });
}

async function sendOtpChallenge(
  channelRaw: string,
  destinationRaw: string,
  code: string
): Promise<{ provider: string; channel: string; maskedDestination: string }> {
  const channel = String(channelRaw || "email").toLowerCase();
  const provider =
    channel === "sms"
      ? String(process.env.OTP_SMS_PROVIDER || process.env.OTP_PROVIDER || "").trim().toLowerCase()
      : String(process.env.OTP_EMAIL_PROVIDER || process.env.OTP_PROVIDER || "").trim().toLowerCase();
  const destination = String(destinationRaw || "").trim();
  if (!destination) throw new Error("Missing OTP destination");
  if (!provider) throw new Error("OTP provider not configured");
  if (channel === "sms") {
    const to = normalizePhone(destination);
    if (!to) throw new Error("Invalid SMS destination");
    if (provider === "twilio") {
      const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
      const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
      const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
      if (!sid || !token || !from) throw new Error("Twilio SMS credentials missing");
      const body = new URLSearchParams({
        To: to,
        From: from,
        Body: `NeuroEdge verification code: ${code}. Expires in 10 minutes.`,
      });
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const resp = await axios.post(url, body.toString(), {
        auth: { username: sid, password: token },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 12000,
      });
      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`Twilio SMS failed with status ${resp.status}`);
      }
      return { provider: "twilio", channel: "sms", maskedDestination: maskPhone(to) };
    }
    throw new Error(`Unsupported SMS provider: ${provider}`);
  }
  const toEmail = destination.toLowerCase();
  if (provider === "resend") {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
    if (!apiKey || !from) throw new Error("Resend email credentials missing");
    const resp = await axios.post(
      "https://api.resend.com/emails",
      {
        from,
        to: [toEmail],
        subject: "NeuroEdge verification code",
        text: `Your NeuroEdge verification code is ${code}. It expires in 10 minutes.`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 12000,
      }
    );
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Resend email failed with status ${resp.status}`);
    }
    return { provider: "resend", channel: "email", maskedDestination: maskEmail(toEmail) };
  }
  throw new Error(`Unsupported email provider: ${provider}`);
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
    computeDonation: {
      ownerDevices: [],
      ownerPolicies: [],
      ownerPayoutProfiles: [],
      payoutRequests: [],
      verificationChallenges: [],
      resourceGuardrails: {
        maxCpuPct: 35,
        maxRamPct: 40,
        pauseOnBattery: true,
        pauseOnHighTempC: 80,
        backgroundOnly: true,
      },
      payoutBudget: {
        period: new Date().toISOString().slice(0, 7),
        totalRevenueUsd: 0,
        allocatedUsd: 0,
        pendingUsd: 0,
        approvedUsd: 0,
        sentUsd: 0,
        reserveUsd: 0,
        updatedAt: Date.now(),
      },
      autoPayoutConfig: {
        enabled: true,
        period: "weekly",
        maxPayoutsPerRun: 200,
        lastRunBucket: "",
        lastRunAt: 0,
      },
      chainPayoutConfig: {
        enabled: false,
        chainName: "NeuroChain",
        rpcUrl: "",
        treasuryWallet: "",
        payoutToken: "WDC",
        payoutContract: "",
        minOnchainPayoutWdc: 1,
        confirmationsRequired: 6,
        updatedAt: Date.now(),
      },
    },
    loanOps: {
      companies: [],
      devices: [],
      apiKeys: [],
      integrations: [],
      intakeLogs: [],
      disputes: [],
      legalConsents: [],
      policy: {
        consentRequired: true,
        legalRestrictedModeOnly: true,
        allowTrustedContactRecovery: true,
        locationOnTheftWithConsent: true,
        antiTamperMonitoring: true,
        attestationRequiredDefault: true,
        autoRelockOnLoanDefault: true,
        allowedAttestationProviders: ["android_play_integrity", "ios_devicecheck", "desktop_tpm"],
      },
      updatedAt: Date.now(),
    },
    userProtection: {
      profiles: [],
      incidents: [],
      policy: {
        paidMaxDevices: 3,
        freeMaxDevices: 1,
        requireConsentForLocation: true,
      },
      updatedAt: Date.now(),
    },
    mobileTwinBridge: {
      devices: [],
      pendingActions: [],
      actionReceipts: [],
      policy: {
        enabled: true,
        requireAttestation: true,
        requireExplicitCallPermission: true,
        maxPendingActions: 2000,
        actionTtlMs: 24 * 60 * 60 * 1000,
        allowedPlatforms: ["android", "ios"],
      },
      updatedAt: Date.now(),
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
        system: true,
      },
      {
        id: "analytics-plugin",
        name: "Analytics Plugin",
        description: "Provides execution metrics and dashboards",
        active: false,
        permissions: ["read-metrics"],
        version: "0.9.2",
        system: true,
      },
      {
        id: "custom-commands",
        name: "Custom Commands",
        description: "Adds custom commands to the NeuroEdge Command Palette",
        active: true,
        permissions: ["execute-scripts"],
        version: "1.1.0",
        system: true,
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
    neuroExpansionNotifications: [],
    meshExpansion: {
      assistants: [
        {
          id: "mesh-architect",
          name: "Mesh Architect",
          status: "active",
          focus: ["topology", "routing", "node-health", "latency-optimization"],
          canPropose: true,
          canMerge: false,
          updatedAt: Date.now(),
        },
        {
          id: "mesh-task-orchestrator",
          name: "Task Orchestrator",
          status: "active",
          focus: ["distributed-tasks", "failover", "retry"],
          canPropose: true,
          canMerge: false,
          updatedAt: Date.now(),
        },
      ],
      policy: {
        enabled: true,
        autoScanEnabled: true,
        lowPowerDefault: true,
        discoveryDefault: true,
        requireFounderMergeApproval: true,
        taskExecutionEnabled: true,
        maxTaskRetries: 2,
      },
      proposals: [],
      tasks: [],
      scans: [],
      p2p: {
        peers: [],
        links: [],
        gossipLog: [],
        packets: [],
        policy: {
          enabled: true,
          allowStoreAndForward: true,
          maxHops: 8,
          gossipFanout: 3,
        },
      },
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

function normalizeMeshExpansionSection(section: Record<string, any>): Record<string, any> {
  const p2p = (section.p2p || {}) as Record<string, any>;
  return {
    assistants: Array.isArray(section.assistants) ? section.assistants : [],
    policy: {
      enabled: true,
      autoScanEnabled: true,
      lowPowerDefault: true,
      discoveryDefault: true,
      requireFounderMergeApproval: true,
      taskExecutionEnabled: true,
      maxTaskRetries: 2,
      ...(section.policy || {}),
    },
    proposals: Array.isArray(section.proposals) ? section.proposals : [],
    tasks: Array.isArray(section.tasks) ? section.tasks : [],
    scans: Array.isArray(section.scans) ? section.scans : [],
    relayMessages: Array.isArray(section.relayMessages) ? section.relayMessages : [],
    p2p: {
      peers: Array.isArray(p2p.peers) ? p2p.peers : [],
      links: Array.isArray(p2p.links) ? p2p.links : [],
      gossipLog: Array.isArray(p2p.gossipLog) ? p2p.gossipLog : [],
      packets: Array.isArray(p2p.packets) ? p2p.packets : [],
      policy: {
        enabled: true,
        allowStoreAndForward: true,
        maxHops: 8,
        gossipFanout: 3,
        ...(p2p.policy || {}),
      },
    },
    updatedAt: Number(section.updatedAt || Date.now()),
  };
}

function buildP2PAdjacency(peers: any[], links: any[]): Map<string, string[]> {
  const activePeers = new Set(
    (Array.isArray(peers) ? peers : [])
      .filter((p: any) => String(p.status || "active") === "active")
      .map((p: any) => String(p.id || ""))
      .filter(Boolean)
  );
  const adj = new Map<string, string[]>();
  for (const id of activePeers) adj.set(id, []);
  for (const link of Array.isArray(links) ? links : []) {
    const a = String(link.from || "");
    const b = String(link.to || "");
    if (!a || !b) continue;
    if (String(link.status || "active") !== "active") continue;
    if (!activePeers.has(a) || !activePeers.has(b)) continue;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  return adj;
}

function findP2PRoute(adj: Map<string, string[]>, from: string, to: string, maxHops: number): string[] {
  if (!adj.has(from) || !adj.has(to)) return [];
  if (from === to) return [from];
  const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length - 1 > Math.max(1, maxHops)) continue;
    for (const nxt of adj.get(current.node) || []) {
      if (seen.has(nxt)) continue;
      const path = [...current.path, nxt];
      if (nxt === to) return path;
      seen.add(nxt);
      queue.push({ node: nxt, path });
    }
  }
  return [];
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
  { id: "compute.owner.manage", group: "compute", label: "Manage Own Compute Donation Devices", scope: "chat:write", roles: ["founder", "admin", "developer", "enterprise", "user"] },
  { id: "compute.payout.manage", group: "compute", label: "Approve/Send Compute Payouts", scope: "admin:write", roles: ["founder", "admin"] },
  { id: "loanops.manage", group: "device_security", label: "Manage LoanOps Device Security", scope: "admin:write", roles: ["founder", "admin", "enterprise"] },
  { id: "user.protection.manage", group: "device_security", label: "Manage Own Device Protection", scope: "chat:write", roles: ["founder", "admin", "developer", "enterprise", "user"] },
  { id: "twin.mobile.manage", group: "twin", label: "Manage Mobile Twin Bridge", scope: "chat:write", roles: ["founder", "admin", "developer", "enterprise", "user"] },
  { id: "neuroexpansion.manage", group: "platform", label: "NeuroExpansion Build + Merge", scope: "admin:write", roles: ["founder", "admin", "developer"] },
  { id: "mesh_expansion.manage", group: "mesh", label: "Mesh Expansion Engine + Tasks", scope: "admin:write", roles: ["founder", "admin"] },
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

  app.post(
    "/assistant/ops/ask",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    async (req: Request, res: Response) => {
      const query = String(req.body?.query || "").trim();
      if (!query) return res.status(400).json({ error: "Missing query" });

      const role = actorRole(req) || "user";
      const q = query.toLowerCase();
      const kernelBase = process.env.KERNEL_URL || "http://localhost:8080";
      const mlBase = process.env.ML_URL || "http://localhost:8090";

      const check = async (name: string, url: string) => {
        try {
          await axios.get(url, { timeout: 4000 });
          return { name, status: "online" as const, detail: "reachable" };
        } catch (err: any) {
          return { name, status: "offline" as const, detail: err?.message || "not reachable" };
        }
      };

      const services = await Promise.all([
        Promise.resolve({ name: "orchestrator", status: "online" as const, detail: "serving api" }),
        check("kernel", `${kernelBase.replace(/\/$/, "")}/health`),
        check("ml", `${mlBase.replace(/\/$/, "")}/ready`),
      ]);

      const canDeepTwin = role === "founder" || role === "admin" || role === "developer";
      let neuroTwinProfile: any = null;
      let neuroTwinReport: any = null;
      let twinCoreReport: any = null;
      if (canDeepTwin) {
        const [profileRes, reportRes, coreRes] = await Promise.allSettled([
          axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/profile`, { timeout: 6000 }),
          axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/report`, { timeout: 7000 }),
          axios.get(`${mlBase.replace(/\/$/, "")}/twin/report`, { timeout: 7000 }),
        ]);
        neuroTwinProfile = profileRes.status === "fulfilled" ? profileRes.value.data : null;
        neuroTwinReport = reportRes.status === "fulfilled" ? reportRes.value.data : null;
        twinCoreReport = coreRes.status === "fulfilled" ? coreRes.value.data : null;
      }

      const recentEvents = listEvents(1200);
      const updateEvents = recentEvents
        .filter((e) => /admin\.|dashboard|model_quality|frontier|training|neuroexpansion/i.test(String(e.type || "")))
        .slice(-12)
        .reverse()
        .map((e) => ({
          type: e.type,
          when: new Date(Number(e.timestamp || Date.now())).toISOString(),
        }));

      const textBuckets: string[] = [];
      for (const e of recentEvents.slice(-600)) {
        const p = (e && e.payload) || {};
        const candidates = [
          (p as any).query,
          (p as any).prompt,
          (p as any).message,
          (p as any).command,
          (p as any).text,
        ];
        for (const c of candidates) {
          if (typeof c === "string" && c.trim()) textBuckets.push(c.toLowerCase());
        }
      }
      const stopWords = new Set([
        "the","and","for","with","that","this","from","you","your","are","was","have","what","when","where","how","why","can","could",
        "would","should","into","about","there","their","they","them","then","than","been","were","will","just","like","want","need",
      ]);
      const freq = new Map<string, number>();
      for (const t of textBuckets) {
        const tokens = t.split(/[^a-z0-9_+-]+/).filter((x) => x.length >= 3 && !stopWords.has(x));
        for (const tok of tokens) freq.set(tok, (freq.get(tok) || 0) + 1);
      }
      const trendingNeeds = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([term, count]) => ({ term, count }));

      const offline = services.filter((s) => s.status !== "online");
      const wantsNodes = /node|down|status|health|offline|kernel|orchestrator|ml/.test(q);
      const wantsUpdates = /update|changed|new|release|what has been updated|recent/.test(q);
      const wantsTrends = /trend|trending|users want|demand|popular/.test(q);
      const wantsCode = /code|coding|implement|fix|debug|refactor|build/.test(q);
      const wantsCompetition = /competitor|openai|gemini|claude|copilot|market/.test(q);

      const responseLines: string[] = [];
      responseLines.push(`I have your request. Here is the latest operational view for ${role}.`);
      if (wantsNodes || q.includes("which node is down")) {
        if (offline.length === 0) responseLines.push("All core services are online right now.");
        else responseLines.push(`Nodes needing attention: ${offline.map((s) => `${s.name} (${s.detail})`).join(", ")}.`);
      }
      if (wantsUpdates) {
        if (updateEvents.length === 0) responseLines.push("No significant admin/system updates were logged recently.");
        else responseLines.push(`Recent updates logged: ${updateEvents.slice(0, 4).map((u) => `${u.type} @ ${u.when}`).join(" | ")}.`);
      }
      if (canDeepTwin && neuroTwinProfile?.profile) {
        const p = neuroTwinProfile.profile || {};
        responseLines.push(
          `NeuroTwin context loaded: owner=${String(p.owner || "unknown")}, tone=${String(p.tone || "n/a")}, style=${String(p.communication_style || "n/a")}.`
        );
      }
      if (canDeepTwin && neuroTwinReport) {
        const mCount = Array.isArray(neuroTwinReport.recent_meetings) ? neuroTwinReport.recent_meetings.length : 0;
        const dCount = Array.isArray(neuroTwinReport.recent_decisions) ? neuroTwinReport.recent_decisions.length : 0;
        responseLines.push(`NeuroTwin memory snapshot: ${mCount} recent meetings, ${dCount} recent decision simulations.`);
      }
      if (canDeepTwin && twinCoreReport) {
        const risk = String(twinCoreReport?.analysis?.risk_level || "unknown");
        const files = Number(twinCoreReport?.scan?.structure?.total_files || 0);
        responseLines.push(`TwinCore scan context: risk=${risk}, scanned_files=${files}.`);
      }
      if (wantsTrends) {
        if (trendingNeeds.length === 0) responseLines.push("I do not have enough signal yet for user-demand trends.");
        else responseLines.push(`Current user-signal trends: ${trendingNeeds.slice(0, 5).map((t) => `${t.term}(${t.count})`).join(", ")}.`);
      }
      if (wantsCompetition) {
        responseLines.push(
          "Competitors do memory/research/connectors well. They are weaker on local-first mesh ownership and transparent ops controls for normal users."
        );
      }

      const codingPlan = wantsCode
        ? {
            mode: "safe_plan_only",
            summary: "Prepared a code execution plan with approval gate.",
            steps: [
              "Clarify target module and acceptance criteria",
              "Generate patch proposal and risk notes",
              "Run typecheck/test before merge",
              "Require founder/admin approval for production-impacting changes",
            ],
            approval_required: true,
          }
        : null;

      if (wantsCode) {
        responseLines.push("For coding requests, I can prepare a patch plan now and execute only after your approval.");
      }
      if (!wantsNodes && !wantsUpdates && !wantsTrends && !wantsCode && !wantsCompetition) {
        responseLines.push("Ask me node health, updates, trends, market gaps, or a coding task, and I will answer immediately.");
      }

      const competitorLandscape = {
        similar_projects_do: [
          "memory + deep research + connectors",
          "role-based enterprise controls",
          "assistant presets and workspace tooling",
        ],
        similar_projects_miss: [
          "default local-first mesh execution",
          "portable user-owned assistant configs across deployments",
          "visible trust verification metadata for all high-stakes responses",
        ],
        what_people_want: [
          "higher factual precision",
          "faster, reliable responses",
          "privacy and explicit control",
          "human fallback for sensitive operations",
        ],
        future_features: [
          "voice-first operations cockpit",
          "autonomous but approval-gated coding copilot",
          "predictive incident prevention and SRE autopilot",
          "cross-device twin continuity with secure handoff",
        ],
      };

      const answer = responseLines.join("\n\n");
      appendEvent({
        type: "assistant.ops.ask",
        timestamp: Date.now(),
        payload: {
          query,
          role,
          orgId: req.auth?.orgId || "personal",
          workspaceId: req.auth?.workspaceId || "default",
          offlineCount: offline.length,
        },
      });

      res.json({
        success: true,
        assistant: {
          response: answer,
          voice_response: answer,
          services,
          neurotwin_profile: neuroTwinProfile,
          neurotwin_report: neuroTwinReport,
          twincore_report: twinCoreReport,
          recent_updates: updateEvents,
          trending_needs: trendingNeeds,
          coding_plan: codingPlan,
          competitor_landscape: competitorLandscape,
          role,
          generated_at: new Date().toISOString(),
        },
      });
    }
  );

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

  const normalizeLoanOpsSection = (section: Record<string, any>) => ({
    ...section,
    companies: Array.isArray(section.companies) ? section.companies : [],
    devices: Array.isArray(section.devices) ? section.devices : [],
    apiKeys: Array.isArray(section.apiKeys) ? section.apiKeys : [],
    integrations: Array.isArray(section.integrations) ? section.integrations : [],
    intakeLogs: Array.isArray(section.intakeLogs) ? section.intakeLogs : [],
    disputes: Array.isArray(section.disputes) ? section.disputes : [],
    legalConsents: Array.isArray(section.legalConsents) ? section.legalConsents : [],
    policy: {
      consentRequired: true,
      legalRestrictedModeOnly: true,
      allowTrustedContactRecovery: true,
      locationOnTheftWithConsent: true,
      antiTamperMonitoring: true,
      attestationRequiredDefault: true,
      autoRelockOnLoanDefault: true,
      allowedAttestationProviders: ["android_play_integrity", "ios_devicecheck", "desktop_tpm"],
      ...(section.policy || {}),
    },
    updatedAt: Number(section.updatedAt || Date.now()),
  });

  app.get(
    "/admin/loan-ops/bootstrap",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const isEnterprise = actorRole(req) === "enterprise";
      const orgId = String(req.auth?.orgId || "personal");
      const filterByOrg = (arr: any[]) =>
        isEnterprise ? arr.filter((x: any) => String(x.orgId || "personal") === orgId) : arr;
      res.json({
        success: true,
        loanOps: {
          companies: filterByOrg(section.companies),
          devices: filterByOrg(section.devices),
          apiKeys: filterByOrg(section.apiKeys),
          integrations: filterByOrg(section.integrations),
          intakeLogs: filterByOrg(section.intakeLogs).slice(0, 300),
          disputes: filterByOrg(section.disputes).slice(0, 300),
          legalConsents: filterByOrg(section.legalConsents).slice(0, 300),
          policy: section.policy,
          updatedAt: Number(section.updatedAt || Date.now()),
        },
      });
    }
  );

  app.post(
    "/admin/loan-ops/company/upsert",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const input = req.body?.company || {};
      const id = String(input.id || `loan-co-${Date.now()}`).trim();
      const name = String(input.name || "").trim();
      if (!name) return res.status(400).json({ error: "Missing company name" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const companies = section.companies;
      const orgId = String(req.auth?.orgId || "personal");
      const role = actorRole(req);
      const exists = companies.some((c: any) => String(c.id) === id);
      const nextItem = {
        id,
        name,
        orgId: role === "enterprise" ? orgId : String(input.orgId || orgId),
        contactEmail: String(input.contactEmail || ""),
        contactPhone: String(input.contactPhone || ""),
        legalPolicyRef: String(input.legalPolicyRef || ""),
        attestationRequired: Boolean(input.attestationRequired ?? section.policy?.attestationRequiredDefault ?? true),
        autoRelockOnLoan: Boolean(input.autoRelockOnLoan ?? section.policy?.autoRelockOnLoanDefault ?? true),
        mdmProvider: String(input.mdmProvider || "android_enterprise"),
        oemProvider: String(input.oemProvider || ""),
        enrollmentMode: String(input.enrollmentMode || "device_owner"),
        lockWorkflow: String(input.lockWorkflow || "mdm_lock"),
        status: String(input.status || "active"),
        updatedAt: Date.now(),
      };
      const nextCompanies = exists
        ? companies.map((c: any) => (String(c.id) === id ? { ...c, ...nextItem } : c))
        : [nextItem, ...companies];
      const next = {
        ...section,
        companies: nextCompanies,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", exists ? "company_update" : "company_create", { id, name });
      res.json({ success: true, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/device/import-text",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const companyId = String(req.body?.companyId || "").trim();
      const rawText = String(req.body?.text || req.body?.ocrText || "").trim();
      if (!companyId || !rawText) {
        return res.status(400).json({ error: "Missing companyId or import text" });
      }
      const parsed = parseDeviceLines(rawText);
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const devices = section.devices;
      const orgId = String(req.auth?.orgId || "personal");
      const now = Date.now();
      const imported = parsed.map((d, idx) => ({
        id: `loan-dev-${now}-${idx}`,
        companyId,
        orgId,
        externalId: d.externalId,
        model: d.model,
        serial: d.serial,
        imei: d.imei,
        ownerRef: d.ownerRef,
        loanStatus: "current",
        restrictedMode: false,
        protectionTier: "loan_managed",
        securityState: "protected",
        updatedAt: now,
      }));
      const intakeLog = {
        id: `intake-${now}-${Math.random().toString(36).slice(2, 7)}`,
        companyId,
        orgId,
        source: "text_or_ocr",
        importedCount: imported.length,
        actor: req.auth?.sub || "unknown",
        actorRole: actorRole(req),
        createdAt: now,
      };
      const next = {
        ...section,
        devices: [...imported, ...devices].slice(0, 200000),
        intakeLogs: [intakeLog, ...section.intakeLogs].slice(0, 5000),
        updatedAt: now,
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "device_import_text", { companyId, imported: imported.length });
      res.json({ success: true, imported: imported.length, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/device/upsert",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const input = req.body?.device || {};
      const id = String(input.id || `loan-dev-${Date.now()}`).trim();
      const companyId = String(input.companyId || "").trim();
      const model = String(input.model || "").trim();
      if (!companyId || !model) return res.status(400).json({ error: "Missing companyId or model" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const devices = section.devices;
      const now = Date.now();
      const orgId = String(req.auth?.orgId || "personal");
      const exists = devices.some((d: any) => String(d.id) === id);
      const device = {
        id,
        companyId,
        orgId,
        externalId: String(input.externalId || ""),
        model,
        serial: String(input.serial || ""),
        imei: String(input.imei || ""),
        ownerRef: String(input.ownerRef || ""),
        loanStatus: String(input.loanStatus || "current"),
        restrictedMode: Boolean(input.restrictedMode || false),
        restrictionReason: String(input.restrictionReason || ""),
        protectionTier: String(input.protectionTier || "loan_managed"),
        securityState: String(input.securityState || "protected"),
        complianceState: String(input.complianceState || "trusted"),
        attestationProvider: String(input.attestationProvider || ""),
        attestationStatus: String(input.attestationStatus || "unknown"),
        attestationAt: Number(input.attestationAt || 0),
        reEnrollRequiredAt: Number(input.reEnrollRequiredAt || 0),
        lockState: String(input.lockState || "unlocked"),
        tamperAlerts: Number(input.tamperAlerts || 0),
        updatedAt: now,
      };
      const nextDevices = exists
        ? devices.map((d: any) => (String(d.id) === id ? { ...d, ...device } : d))
        : [device, ...devices];
      const next = {
        ...section,
        devices: nextDevices,
        updatedAt: now,
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", exists ? "device_update" : "device_create", { id, companyId });
      res.json({ success: true, loanOps: next, device });
    }
  );

  app.post(
    "/admin/loan-ops/device/loan-status",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.deviceId || "").trim();
      const loanStatus = String(req.body?.loanStatus || "").trim().toLowerCase();
      if (!id || !["current", "grace", "overdue", "dispute", "paid_off"].includes(loanStatus)) {
        return res.status(400).json({ error: "Missing deviceId or invalid loanStatus" });
      }
      const overdueDays = Math.max(0, Number(req.body?.overdueDays || 0));
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const devices = section.devices;
      let updated: any = null;
      const nextDevices = devices.map((d: any) => {
        if (String(d.id) !== id) return d;
        const paidOff = loanStatus === "paid_off";
        const restricted = !paidOff && loanStatus === "overdue" && overdueDays >= 1;
        updated = {
          ...d,
          loanStatus,
          overdueDays,
          restrictedMode: restricted,
          restrictionReason: restricted ? "loan_overdue" : "",
          securityState: paidOff ? "user_controlled" : "protected",
          complianceState: paidOff ? "trusted" : restricted ? "restricted" : String(d.complianceState || "trusted"),
          lockState: restricted ? "locked" : paidOff ? "unlocked" : String(d.lockState || "unlocked"),
          ownershipReleasedAt: paidOff ? Date.now() : 0,
          updatedAt: Date.now(),
        };
        return updated;
      });
      if (!updated) return res.status(404).json({ error: "Loan device not found" });
      const next = {
        ...section,
        devices: nextDevices,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "loan_status_update", { id, loanStatus, overdueDays });
      res.json({ success: true, device: updated, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/api-keys/create",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const companyId = String(req.body?.companyId || "").trim();
      const name = String(req.body?.name || "LoanOps API Key").trim();
      if (!companyId) return res.status(400).json({ error: "Missing companyId" });
      const key = generateApiKey("ne_loan");
      const now = Date.now();
      const rec = {
        id: `lkey-${now}-${Math.random().toString(36).slice(2, 7)}`,
        companyId,
        orgId: String(req.auth?.orgId || "personal"),
        name,
        keyMasked: `${key.slice(0, 8)}...${key.slice(-4)}`,
        key,
        scopes: ["loanops:read", "loanops:write", "device:status"],
        status: "active",
        createdAt: now,
        createdBy: req.auth?.sub || "unknown",
      };
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const next = {
        ...section,
        apiKeys: [rec, ...section.apiKeys].slice(0, 10000),
        updatedAt: now,
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "api_key_create", { companyId, keyId: rec.id });
      res.json({ success: true, apiKey: key, apiKeyRecord: { ...rec, key: undefined }, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/api-keys/revoke",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ error: "Missing key id" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const keys = section.apiKeys;
      const nextKeys = keys.map((k: any) =>
        String(k.id) === id ? { ...k, status: "revoked", revokedAt: Date.now(), key: undefined } : k
      );
      const next = { ...section, apiKeys: nextKeys, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "api_key_revoke", { id });
      res.json({ success: true, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/integration/upsert",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const input = req.body?.integration || {};
      const id = String(input.id || `loan-int-${Date.now()}`).trim();
      const companyId = String(input.companyId || "").trim();
      const systemName = String(input.systemName || "").trim();
      if (!companyId || !systemName) return res.status(400).json({ error: "Missing companyId or systemName" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const integrations = section.integrations;
      const exists = integrations.some((i: any) => String(i.id) === id);
      const nextRec = {
        id,
        companyId,
        orgId: String(req.auth?.orgId || "personal"),
        systemName,
        baseUrl: String(input.baseUrl || ""),
        webhookUrl: String(input.webhookUrl || ""),
        authMode: String(input.authMode || "api_key"),
        status: String(input.status || "active"),
        notes: String(input.notes || ""),
        updatedAt: Date.now(),
      };
      const nextIntegrations = exists
        ? integrations.map((i: any) => (String(i.id) === id ? { ...i, ...nextRec } : i))
        : [nextRec, ...integrations];
      const next = { ...section, integrations: nextIntegrations, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", exists ? "integration_update" : "integration_create", {
        id,
        companyId,
      });
      res.json({ success: true, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/policy/save",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const incoming = (req.body?.policy || {}) as Record<string, any>;
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const allowedProviders = Array.isArray(incoming.allowedAttestationProviders)
        ? incoming.allowedAttestationProviders.map((x: any) => String(x)).filter(Boolean)
        : section.policy.allowedAttestationProviders;
      const nextPolicy = {
        ...section.policy,
        consentRequired: Boolean(incoming.consentRequired ?? section.policy.consentRequired),
        legalRestrictedModeOnly: Boolean(incoming.legalRestrictedModeOnly ?? section.policy.legalRestrictedModeOnly),
        allowTrustedContactRecovery: Boolean(
          incoming.allowTrustedContactRecovery ?? section.policy.allowTrustedContactRecovery
        ),
        locationOnTheftWithConsent: Boolean(
          incoming.locationOnTheftWithConsent ?? section.policy.locationOnTheftWithConsent
        ),
        antiTamperMonitoring: Boolean(incoming.antiTamperMonitoring ?? section.policy.antiTamperMonitoring),
        attestationRequiredDefault: Boolean(
          incoming.attestationRequiredDefault ?? section.policy.attestationRequiredDefault
        ),
        autoRelockOnLoanDefault: Boolean(
          incoming.autoRelockOnLoanDefault ?? section.policy.autoRelockOnLoanDefault
        ),
        allowedAttestationProviders: allowedProviders.length ? allowedProviders : section.policy.allowedAttestationProviders,
      };
      const next = { ...section, policy: nextPolicy, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "policy_save", nextPolicy);
      res.json({ success: true, loanOps: next, policy: nextPolicy });
    }
  );

  app.post(
    "/admin/loan-ops/device/attestation/report",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const attestation = (req.body?.attestation || {}) as Record<string, any>;
      const provider = String(attestation.provider || "").trim();
      const status = String(attestation.status || "failed").trim().toLowerCase();
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      let updated: any = null;
      const nextDevices = section.devices.map((d: any) => {
        if (String(d.id) !== deviceId) return d;
        const ok = status === "passed" || status === "trusted";
        updated = {
          ...d,
          attestationProvider: provider,
          attestationStatus: ok ? "passed" : "failed",
          attestationAt: Date.now(),
          attestationNonce: String(attestation.nonce || ""),
          attestationEvidenceRef: String(attestation.evidenceRef || ""),
          complianceState: ok ? "trusted" : "re-enroll-required",
          reEnrollRequiredAt: ok ? 0 : Date.now(),
          securityState: ok ? "protected" : "re-enroll-required",
          updatedAt: Date.now(),
        };
        return updated;
      });
      if (!updated) return res.status(404).json({ error: "Loan device not found" });
      const next = { ...section, devices: nextDevices, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      appendSignedSecurityEvent("aegis.loan.attestation_report", {
        deviceId,
        provider,
        status: updated.attestationStatus,
        complianceState: updated.complianceState,
      });
      res.json({ success: true, device: updated, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/device/boot-check",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const integrityOk = Boolean(req.body?.integrityOk ?? false);
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      let updated: any = null;
      const nextDevices = section.devices.map((d: any) => {
        if (String(d.id) !== deviceId) return d;
        const company = section.companies.find((c: any) => String(c.id) === String(d.companyId));
        const attestationRequired = Boolean(
          company?.attestationRequired ?? section.policy.attestationRequiredDefault ?? true
        );
        const autoRelock = Boolean(company?.autoRelockOnLoan ?? section.policy.autoRelockOnLoanDefault ?? true);
        const unpaidLoan = !["paid_off"].includes(String(d.loanStatus || "").toLowerCase());
        const attestationFail = attestationRequired && String(d.attestationStatus || "") !== "passed";
        const restricted = unpaidLoan && autoRelock && (!integrityOk || attestationFail);
        updated = {
          ...d,
          lastBootCheckAt: Date.now(),
          bootIntegrityOk: integrityOk,
          complianceState: restricted ? "re-enroll-required" : "trusted",
          restrictedMode: restricted ? true : Boolean(d.restrictedMode),
          securityState: restricted ? "re-enroll-required" : d.securityState || "protected",
          lockState: restricted ? "locked" : String(d.lockState || "unlocked"),
          updatedAt: Date.now(),
        };
        return updated;
      });
      if (!updated) return res.status(404).json({ error: "Loan device not found" });
      const next = { ...section, devices: nextDevices, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      appendSignedSecurityEvent("aegis.loan.boot_check", {
        deviceId,
        integrityOk,
        complianceState: updated.complianceState,
        lockState: updated.lockState,
      });
      res.json({ success: true, device: updated, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/device/reenroll",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      let updated: any = null;
      const nextDevices = section.devices.map((d: any) => {
        if (String(d.id) !== deviceId) return d;
        updated = {
          ...d,
          complianceState: "trusted",
          securityState: "protected",
          lockState: "unlocked",
          reEnrollRequiredAt: 0,
          reenrolledAt: Date.now(),
          updatedAt: Date.now(),
        };
        return updated;
      });
      if (!updated) return res.status(404).json({ error: "Loan device not found" });
      const next = { ...section, devices: nextDevices, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "device_reenroll", { deviceId });
      res.json({ success: true, device: updated, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/device/lock-trigger",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const deviceId = String(req.body?.deviceId || "").trim();
      const lock = Boolean(req.body?.lock ?? true);
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const reason = String(req.body?.reason || (lock ? "loan_policy_lock" : "manual_unlock"));
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      let updated: any = null;
      const nextDevices = section.devices.map((d: any) => {
        if (String(d.id) !== deviceId) return d;
        updated = {
          ...d,
          lockState: lock ? "locked" : "unlocked",
          securityState: lock ? "restricted" : "protected",
          restrictedMode: lock ? true : Boolean(d.restrictedMode && String(d.loanStatus || "") !== "paid_off"),
          restrictionReason: lock ? reason : String(d.restrictionReason || ""),
          lockUpdatedAt: Date.now(),
          updatedAt: Date.now(),
        };
        return updated;
      });
      if (!updated) return res.status(404).json({ error: "Loan device not found" });
      const next = { ...section, devices: nextDevices, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      appendSignedSecurityEvent("aegis.loan.lock_trigger", {
        deviceId,
        lock,
        reason,
        actor: req.auth?.sub || "unknown",
      });
      res.json({ success: true, device: updated, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/dispute/open",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const deviceId = String(req.body?.deviceId || "").trim();
      const companyId = String(req.body?.companyId || "").trim();
      if (!deviceId || !companyId) return res.status(400).json({ error: "Missing deviceId or companyId" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const dispute = {
        id: `loan-dispute-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        deviceId,
        companyId,
        orgId: String(req.auth?.orgId || "personal"),
        status: "open",
        reason: String(req.body?.reason || "customer_dispute"),
        evidenceRef: String(req.body?.evidenceRef || ""),
        openedBy: req.auth?.sub || "unknown",
        openedAt: Date.now(),
        resolvedAt: 0,
      };
      const next = {
        ...section,
        disputes: [dispute, ...section.disputes].slice(0, 10000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "dispute_open", { disputeId: dispute.id, deviceId, companyId });
      res.json({ success: true, dispute, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/dispute/resolve",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const disputeId = String(req.body?.disputeId || "").trim();
      const resolution = String(req.body?.resolution || "resolved");
      if (!disputeId) return res.status(400).json({ error: "Missing disputeId" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      let resolved: any = null;
      const nextDisputes = section.disputes.map((d: any) => {
        if (String(d.id) !== disputeId) return d;
        resolved = {
          ...d,
          status: "resolved",
          resolution,
          resolvedBy: req.auth?.sub || "unknown",
          resolvedAt: Date.now(),
        };
        return resolved;
      });
      if (!resolved) return res.status(404).json({ error: "Dispute not found" });
      const next = { ...section, disputes: nextDisputes, updatedAt: Date.now() };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "dispute_resolve", { disputeId, resolution });
      res.json({ success: true, dispute: resolved, loanOps: next });
    }
  );

  app.post(
    "/admin/loan-ops/legal-consent/record",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin", "enterprise"]),
    (req: Request, res: Response) => {
      const companyId = String(req.body?.companyId || "").trim();
      const subjectRef = String(req.body?.subjectRef || "").trim();
      const consentType = String(req.body?.consentType || "").trim();
      if (!companyId || !subjectRef || !consentType) {
        return res.status(400).json({ error: "Missing companyId, subjectRef, or consentType" });
      }
      const { dashboard } = readDashboardSummary();
      const section = normalizeLoanOpsSection((dashboard.loanOps || {}) as Record<string, any>);
      const consent = {
        id: `loan-consent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        companyId,
        orgId: String(req.auth?.orgId || "personal"),
        subjectRef,
        consentType,
        legalBasis: String(req.body?.legalBasis || "contract"),
        evidenceRef: String(req.body?.evidenceRef || ""),
        recordedBy: req.auth?.sub || "unknown",
        recordedAt: Date.now(),
      };
      const next = {
        ...section,
        legalConsents: [consent, ...section.legalConsents].slice(0, 10000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("loanOps", next);
      auditDashboardAction(req, "loan_ops", "legal_consent_record", {
        companyId,
        subjectRef,
        consentType,
      });
      res.json({ success: true, consent, loanOps: next });
    }
  );

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

  app.get(
    "/dashboard/compute-owner/bootstrap",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const identity = actorDashboardIdentity(req);
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const devices = Array.isArray(compute.ownerDevices) ? compute.ownerDevices : [];
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const payoutProfiles = Array.isArray(compute.ownerPayoutProfiles) ? compute.ownerPayoutProfiles : [];
      const payoutRequests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      const ownerPolicy =
        ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || null;
      const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
      const wallet =
        (Array.isArray(ledger.wallets) ? ledger.wallets : []).find(
          (w: any) => String(w.userId || "").toLowerCase() === identity.userId
        ) || null;
      res.json({
        success: true,
        owner: identity,
        guardrails: compute.resourceGuardrails || {},
        ownerPolicy: normalizeOwnerComputePolicy(ownerPolicy),
        devices: devices
          .filter((d: any) => String(d.ownerUserId || "").toLowerCase() === identity.userId)
          .map((d: any) => applyOwnerConsentToDevice(d, ownerPolicy)),
        payoutProfile:
          payoutProfiles.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || null,
        payoutRequests: payoutRequests.filter((p: any) => String(p.userId || "").toLowerCase() === identity.userId),
        wallet,
        chainPayoutConfig: compute.chainPayoutConfig || {},
      });
    }
  );

  app.post(
    "/dashboard/compute-owner/policy/save",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const incoming = (req.body?.policy || {}) as Record<string, any>;
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const nextPolicy = normalizeOwnerComputePolicy({
        ...(ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || {}),
        ...incoming,
        userId: identity.userId,
        userName: identity.userName,
        orgId: identity.orgId,
        updatedAt: Date.now(),
      });
      const nextPolicies = ownerPolicies.some((p: any) => String(p.userId || "").toLowerCase() === identity.userId)
        ? ownerPolicies.map((p: any) =>
            String(p.userId || "").toLowerCase() === identity.userId ? { ...p, ...nextPolicy } : p
          )
        : [{ ...nextPolicy }, ...ownerPolicies];
      const devices = Array.isArray(compute.ownerDevices) ? compute.ownerDevices : [];
      const nextDevices = devices.map((d: any) =>
        String(d.ownerUserId || "").toLowerCase() === identity.userId
          ? applyOwnerConsentToDevice(
              {
                ...d,
                updatedAt: Date.now(),
              },
              nextPolicy
            )
          : d
      );
      const nextCompute = {
        ...compute,
        ownerPolicies: nextPolicies,
        ownerDevices: nextDevices,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", "policy_save", {
        computeExecutionConsent: nextPolicy.computeExecutionConsent,
        trainingConsent: nextPolicy.trainingConsent,
        meshDiscoveryEnabled: nextPolicy.meshDiscoveryEnabled,
        lowPowerMode: nextPolicy.lowPowerMode,
      });
      res.json({ success: true, ownerPolicy: nextPolicy, computeDonation: nextCompute });
    }
  );

  app.post(
    "/dashboard/compute-owner/device/upsert",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const input = req.body?.device || {};
      const id = String(input.id || `owner-dev-${Date.now()}`).trim();
      const hostname = String(input.hostname || "").trim();
      if (!id || !hostname) return res.status(400).json({ error: "Missing device id or hostname" });
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const guardrails = (compute.resourceGuardrails || {}) as Record<string, any>;
      const devices = Array.isArray(compute.ownerDevices) ? compute.ownerDevices : [];
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const ownerPolicy =
        ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) ||
        normalizeOwnerComputePolicy({});
      const exists = devices.some((d: any) => String(d.id) === id && String(d.ownerUserId).toLowerCase() === identity.userId);
      const now = Date.now();
      const baseDevice = {
        id,
        hostname,
        os: String(input.os || "unknown"),
        ownerUserId: identity.userId,
        ownerUserName: identity.userName,
        ownerOrg: identity.orgId,
        status: String(input.status || "mesh_ready"),
        installToken: String(input.installToken || `inst-${Math.random().toString(36).slice(2, 12)}`),
        enrolledAt: Number(input.enrolledAt || now),
        computeEnabled: Boolean(input.computeEnabled ?? false),
        pauseReason: String(input.pauseReason || ""),
        stats: {},
        updatedAt: now,
      };
      const nextDevice = applyOwnerConsentToDevice(
        applyComputeGuardrails(baseDevice, input?.stats || {}, guardrails, now),
        ownerPolicy
      );
      const nextDevices = exists
        ? devices.map((d: any) =>
            String(d.id) === id && String(d.ownerUserId).toLowerCase() === identity.userId
              ? applyOwnerConsentToDevice(
                  applyComputeGuardrails({ ...d, ...baseDevice }, input?.stats || {}, guardrails, now),
                  ownerPolicy
                )
              : d
          )
        : [nextDevice, ...devices];
      const nextCompute = { ...compute, ownerDevices: nextDevices, updatedAt: now };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", exists ? "device_update" : "device_add", { id, hostname });
      res.json({ success: true, computeDonation: nextCompute });
    }
  );

  app.post(
    "/dashboard/compute-owner/device/telemetry",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const id = String(req.body?.id || "").trim();
      const stats = (req.body?.stats || {}) as Record<string, any>;
      if (!id) return res.status(400).json({ error: "Missing device id" });
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const guardrails = (compute.resourceGuardrails || {}) as Record<string, any>;
      const devices = Array.isArray(compute.ownerDevices) ? compute.ownerDevices : [];
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const ownerPolicy =
        ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) ||
        normalizeOwnerComputePolicy({});
      const target = devices.find(
        (d: any) => String(d.id) === id && String(d.ownerUserId || "").toLowerCase() === identity.userId
      );
      if (!target) {
        return res.status(403).json({ error: "Forbidden", details: "You can update telemetry only for your own device" });
      }
      const now = Date.now();
      const nextDevices = devices.map((d: any) =>
        String(d.id) === id && String(d.ownerUserId || "").toLowerCase() === identity.userId
          ? applyOwnerConsentToDevice(applyComputeGuardrails(d, stats, guardrails, now), ownerPolicy)
          : d
      );
      const updated = nextDevices.find((d: any) => String(d.id) === id) || null;
      const nextCompute = { ...compute, ownerDevices: nextDevices, updatedAt: now };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", "device_telemetry", {
        id,
        cpuPct: Number(updated?.stats?.cpuPct || 0),
        ramPct: Number(updated?.stats?.ramPct || 0),
        tempC: Number(updated?.stats?.tempC || 0),
        status: String(updated?.status || "unknown"),
      });
      res.json({ success: true, device: updated, computeDonation: nextCompute });
    }
  );

  app.post(
    "/dashboard/compute-owner/device/action",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const id = String(req.body?.id || "").trim();
      const action = String(req.body?.action || "").trim().toLowerCase();
      if (!id || !["pause", "resume", "suspend", "delete"].includes(action)) {
        return res.status(400).json({ error: "Missing id or invalid action" });
      }
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const devices = Array.isArray(compute.ownerDevices) ? compute.ownerDevices : [];
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const ownerPolicy =
        ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) ||
        normalizeOwnerComputePolicy({});
      const ownDevices = devices.filter((d: any) => String(d.ownerUserId || "").toLowerCase() === identity.userId);
      if (!ownDevices.some((d: any) => String(d.id) === id)) {
        return res.status(403).json({ error: "Forbidden", details: "You can manage only your own devices" });
      }
      let nextDevices = devices;
      if (action === "delete") {
        nextDevices = devices.filter(
          (d: any) => !(String(d.id) === id && String(d.ownerUserId || "").toLowerCase() === identity.userId)
        );
      } else {
        const status = action === "pause" ? "paused" : action === "resume" ? "active" : "suspended";
        nextDevices = devices.map((d: any) =>
          String(d.id) === id && String(d.ownerUserId || "").toLowerCase() === identity.userId
            ? applyOwnerConsentToDevice(
                {
                  ...d,
                  status,
                  computeEnabled: action === "resume",
                  pauseReason: action === "pause" ? "owner_paused" : "",
                  updatedAt: Date.now(),
                },
                ownerPolicy
              )
            : d
        );
      }
      const nextCompute = { ...compute, ownerDevices: nextDevices, updatedAt: Date.now() };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", `device_${action}`, { id });
      res.json({ success: true, computeDonation: nextCompute });
    }
  );

  app.post(
    "/dashboard/compute-owner/payment/request-verify",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    async (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const channel = String(req.body?.channel || "email").toLowerCase();
      const destination =
        channel === "sms"
          ? String(req.body?.phone || req.body?.destination || "").trim()
          : String(req.body?.email || req.body?.destination || actorEmail(req)).trim().toLowerCase();
      if (!destination) {
        return res.status(400).json({
          error: "Missing destination",
          details: channel === "sms" ? "Provide phone number for SMS OTP" : "Provide email for OTP",
        });
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const challenges = Array.isArray(compute.verificationChallenges) ? compute.verificationChallenges : [];
      const challenge = {
        id: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: identity.userId,
        channel,
        code,
        destinationMasked: channel === "sms" ? maskPhone(destination) : maskEmail(destination),
        expiresAt: Date.now() + 10 * 60 * 1000,
        used: false,
        createdAt: Date.now(),
      };
      let delivery: { provider: string; channel: string; maskedDestination: string };
      try {
        delivery = await sendOtpChallenge(channel, destination, code);
      } catch (err: any) {
        return res.status(502).json({
          error: "OTP delivery failed",
          details: err?.message || String(err),
        });
      }
      const nextCompute = {
        ...compute,
        verificationChallenges: [challenge, ...challenges].slice(0, 2000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", "payment_verify_requested", {
        channel,
        challengeId: challenge.id,
        provider: delivery.provider,
      });
      res.json({
        success: true,
        verification: {
          challengeId: challenge.id,
          channel: delivery.channel,
          provider: delivery.provider,
          maskedDestination: delivery.maskedDestination,
          expiresAt: challenge.expiresAt,
        },
      });
    }
  );

  app.post(
    "/dashboard/compute-owner/payment/verify-save",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const challengeId = String(req.body?.challengeId || "").trim();
      const code = String(req.body?.code || "").trim();
      const profile = req.body?.profile || {};
      if (!challengeId || !code) return res.status(400).json({ error: "Missing challengeId or code" });
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const challenges = Array.isArray(compute.verificationChallenges) ? compute.verificationChallenges : [];
      const idx = challenges.findIndex(
        (c: any) =>
          String(c.id) === challengeId &&
          String(c.userId || "").toLowerCase() === identity.userId &&
          String(c.code) === code &&
          !Boolean(c.used) &&
          Number(c.expiresAt || 0) > Date.now()
      );
      if (idx < 0) return res.status(403).json({ error: "Forbidden", details: "Invalid or expired verification" });
      const nextChallenges = [...challenges];
      nextChallenges[idx] = { ...nextChallenges[idx], used: true, usedAt: Date.now() };
      const currentProfiles = Array.isArray(compute.ownerPayoutProfiles) ? compute.ownerPayoutProfiles : [];
      const safeProfile = {
        userId: identity.userId,
        userName: identity.userName,
        verifiedAt: Date.now(),
        paymentMethod: String(profile.paymentMethod || "bank"),
        bankName: String(profile.bankName || ""),
        accountName: String(profile.accountName || ""),
        accountNumberMasked: String(profile.accountNumberMasked || ""),
        swiftCode: String(profile.swiftCode || ""),
        cardHolder: String(profile.cardHolder || ""),
        cardLast4: String(profile.cardLast4 || ""),
        billingCountry: String(profile.billingCountry || ""),
        wdcWalletAddress: String(profile.wdcWalletAddress || ""),
        neuroChainAddress: String(profile.neuroChainAddress || ""),
      };
      const existing = currentProfiles.some((p: any) => String(p.userId || "").toLowerCase() === identity.userId);
      const nextProfiles = existing
        ? currentProfiles.map((p: any) => (String(p.userId || "").toLowerCase() === identity.userId ? safeProfile : p))
        : [safeProfile, ...currentProfiles];
      const nextCompute = {
        ...compute,
        verificationChallenges: nextChallenges,
        ownerPayoutProfiles: nextProfiles,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", "payment_profile_saved_verified", {
        paymentMethod: safeProfile.paymentMethod,
      });
      res.json({ success: true, payoutProfile: safeProfile, computeDonation: nextCompute });
    }
  );

  app.post(
    "/dashboard/compute-owner/payout/request",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const target = String(req.body?.target || "cash").toLowerCase();
      const amountUsd = Math.max(0, Number(req.body?.amountUsd || 0));
      const amountWdc = Math.max(0, Number(req.body?.amountWdc || 0));
      const points = Math.max(0, Number(req.body?.points || 0));
      if (amountUsd <= 0 && amountWdc <= 0 && points <= 0) {
        return res.status(400).json({ error: "Request a positive payout amount" });
      }
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const ownerPolicies = Array.isArray(compute.ownerPolicies) ? compute.ownerPolicies : [];
      const ownerPolicy =
        ownerPolicies.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || null;
      if (!ownerEligibleForComputeRewards(ownerPolicy)) {
        return res.status(403).json({
          error: "Payout eligibility requires compute execution or training consent",
          code: "payout_not_eligible_without_mesh_or_training",
          policy: normalizeOwnerComputePolicy(ownerPolicy),
        });
      }
      const requests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      const budget = (compute.payoutBudget || {}) as Record<string, any>;
      const request = {
        id: `payout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: identity.userId,
        userName: identity.userName,
        target,
        amountUsd,
        amountWdc,
        points,
        status: "pending_approval",
        createdAt: Date.now(),
        approvedAt: 0,
        sentAt: 0,
      };
      const nextBudget = {
        ...budget,
        pendingUsd: Number((Number(budget.pendingUsd || 0) + amountUsd).toFixed(2)),
        updatedAt: Date.now(),
      };
      const nextCompute = {
        ...compute,
        payoutRequests: [request, ...requests].slice(0, 5000),
        payoutBudget: nextBudget,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_owner", "payout_request", {
        requestId: request.id,
        amountUsd,
        amountWdc,
        points,
        target,
      });
      res.json({ success: true, request, computeDonation: nextCompute });
    }
  );

  app.get(
    "/dashboard/protection/bootstrap",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const incidents = Array.isArray(section.incidents) ? section.incidents : [];
      const profile =
        profiles.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || {
          userId: identity.userId,
          userName: identity.userName,
          planTier: isPaidUser(req) ? "paid" : "free",
          maxDevices: isPaidUser(req) ? 3 : 1,
          trustedContacts: [],
          devices: [],
          antiTheftConsent: false,
          locationConsent: false,
          cameraEvidenceConsent: false,
          updatedAt: Date.now(),
        };
      res.json({
        success: true,
        profile,
        incidents: incidents.filter((i: any) => String(i.userId || "").toLowerCase() === identity.userId),
        policy: section.policy || { paidMaxDevices: 3, freeMaxDevices: 1, requireConsentForLocation: true },
      });
    }
  );

  app.post(
    "/dashboard/protection/device/upsert",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const input = req.body?.device || {};
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const idx = profiles.findIndex((p: any) => String(p.userId || "").toLowerCase() === identity.userId);
      const now = Date.now();
      const current =
        idx >= 0
          ? profiles[idx]
          : {
              userId: identity.userId,
              userName: identity.userName,
              planTier: isPaidUser(req) ? "paid" : "free",
              maxDevices: isPaidUser(req) ? 3 : 1,
              trustedContacts: [],
              devices: [],
              antiTheftConsent: false,
              locationConsent: false,
              cameraEvidenceConsent: false,
              updatedAt: now,
            };
      const policy = (section.policy || {}) as Record<string, any>;
      const maxDevices =
        hasRole(req, ["founder", "admin"])
          ? 50
          : current.planTier === "paid"
            ? Math.max(1, Number(policy.paidMaxDevices || 3))
            : Math.max(1, Number(policy.freeMaxDevices || 1));
      const devices = Array.isArray(current.devices) ? current.devices : [];
      const id = String(input.id || `usr-dev-${Date.now()}`).trim();
      const exists = devices.some((d: any) => String(d.id) === id);
      if (!exists && devices.length >= maxDevices) {
        return res.status(400).json({
          error: "Device limit reached",
          details: `Plan allows up to ${maxDevices} protected device(s).`,
        });
      }
      const rec = {
        id,
        label: String(input.label || input.hostname || `Device ${devices.length + 1}`),
        platform: String(input.platform || "unknown"),
        deviceRef: String(input.deviceRef || req.auth?.deviceId || ""),
        status: String(input.status || "protected"),
        createdAt: exists ? Number(devices.find((d: any) => String(d.id) === id)?.createdAt || now) : now,
        updatedAt: now,
      };
      const nextDevices = exists ? devices.map((d: any) => (String(d.id) === id ? { ...d, ...rec } : d)) : [rec, ...devices];
      const nextProfile = {
        ...current,
        planTier: isPaidUser(req) ? "paid" : current.planTier,
        maxDevices,
        devices: nextDevices,
        updatedAt: now,
      };
      const nextProfiles = idx >= 0 ? profiles.map((p: any, i: number) => (i === idx ? nextProfile : p)) : [nextProfile, ...profiles];
      const next = { ...section, profiles: nextProfiles, incidents: Array.isArray(section.incidents) ? section.incidents : [], updatedAt: now };
      mergeDashboardSection("userProtection", next);
      auditDashboardAction(req, "user_protection", exists ? "device_update" : "device_add", { id, maxDevices });
      res.json({ success: true, profile: nextProfile, userProtection: next });
    }
  );

  app.post(
    "/dashboard/protection/device/action",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const id = String(req.body?.id || "").trim();
      const action = String(req.body?.action || "").trim().toLowerCase();
      if (!id || !["pause", "resume", "remove"].includes(action)) {
        return res.status(400).json({ error: "Missing id or invalid action" });
      }
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const idx = profiles.findIndex((p: any) => String(p.userId || "").toLowerCase() === identity.userId);
      if (idx < 0) return res.status(404).json({ error: "Protection profile not found" });
      const profile = profiles[idx];
      const devices = Array.isArray(profile.devices) ? profile.devices : [];
      const nextDevices =
        action === "remove"
          ? devices.filter((d: any) => String(d.id) !== id)
          : devices.map((d: any) =>
              String(d.id) === id
                ? { ...d, status: action === "pause" ? "paused" : "protected", updatedAt: Date.now() }
                : d
            );
      const nextProfile = { ...profile, devices: nextDevices, updatedAt: Date.now() };
      const nextProfiles = profiles.map((p: any, i: number) => (i === idx ? nextProfile : p));
      const next = { ...section, profiles: nextProfiles, incidents: Array.isArray(section.incidents) ? section.incidents : [], updatedAt: Date.now() };
      mergeDashboardSection("userProtection", next);
      auditDashboardAction(req, "user_protection", `device_${action}`, { id });
      res.json({ success: true, profile: nextProfile, userProtection: next });
    }
  );

  app.post(
    "/dashboard/protection/trusted-contact/upsert",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const input = req.body?.contact || {};
      const name = String(input.name || "").trim();
      const endpoint = String(input.endpoint || "").trim();
      if (!name || !endpoint) return res.status(400).json({ error: "Missing contact name or endpoint" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const idx = profiles.findIndex((p: any) => String(p.userId || "").toLowerCase() === identity.userId);
      if (idx < 0) return res.status(404).json({ error: "Protection profile not found" });
      const profile = profiles[idx];
      const contacts = Array.isArray(profile.trustedContacts) ? profile.trustedContacts : [];
      const cid = String(input.id || `contact-${Date.now()}`).trim();
      const exists = contacts.some((c: any) => String(c.id) === cid);
      const rec = {
        id: cid,
        name,
        endpoint,
        channel: String(input.channel || "email"),
        verified: Boolean(input.verified || false),
        updatedAt: Date.now(),
      };
      const nextContacts = exists ? contacts.map((c: any) => (String(c.id) === cid ? { ...c, ...rec } : c)) : [rec, ...contacts];
      const nextProfile = { ...profile, trustedContacts: nextContacts.slice(0, 5), updatedAt: Date.now() };
      const nextProfiles = profiles.map((p: any, i: number) => (i === idx ? nextProfile : p));
      const next = { ...section, profiles: nextProfiles, incidents: Array.isArray(section.incidents) ? section.incidents : [], updatedAt: Date.now() };
      mergeDashboardSection("userProtection", next);
      auditDashboardAction(req, "user_protection", exists ? "trusted_contact_update" : "trusted_contact_add", { id: cid });
      res.json({ success: true, profile: nextProfile, userProtection: next });
    }
  );

  app.post(
    "/dashboard/protection/settings/save",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const idx = profiles.findIndex((p: any) => String(p.userId || "").toLowerCase() === identity.userId);
      if (idx < 0) return res.status(404).json({ error: "Protection profile not found" });
      const profile = profiles[idx];
      const nextProfile = {
        ...profile,
        antiTheftConsent: Boolean(req.body?.antiTheftConsent ?? profile.antiTheftConsent),
        locationConsent: Boolean(req.body?.locationConsent ?? profile.locationConsent),
        cameraEvidenceConsent: Boolean(req.body?.cameraEvidenceConsent ?? profile.cameraEvidenceConsent),
        updatedAt: Date.now(),
      };
      const nextProfiles = profiles.map((p: any, i: number) => (i === idx ? nextProfile : p));
      const next = { ...section, profiles: nextProfiles, incidents: Array.isArray(section.incidents) ? section.incidents : [], updatedAt: Date.now() };
      mergeDashboardSection("userProtection", next);
      auditDashboardAction(req, "user_protection", "settings_save", {
        antiTheftConsent: nextProfile.antiTheftConsent,
        locationConsent: nextProfile.locationConsent,
        cameraEvidenceConsent: nextProfile.cameraEvidenceConsent,
      });
      res.json({ success: true, profile: nextProfile, userProtection: next });
    }
  );

  app.post(
    "/dashboard/protection/incident/report",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const deviceId = String(req.body?.deviceId || "").trim();
      const eventType = String(req.body?.eventType || "tamper_attempt").trim();
      const location = req.body?.location || null;
      const cameraEvidenceRef = String(req.body?.cameraEvidenceRef || "").trim();
      const note = String(req.body?.note || "").trim();
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.userProtection || {}) as Record<string, any>;
      const profiles = Array.isArray(section.profiles) ? section.profiles : [];
      const profile =
        profiles.find((p: any) => String(p.userId || "").toLowerCase() === identity.userId) || null;
      if (!profile) return res.status(404).json({ error: "Protection profile not found" });
      const hasDevice = (Array.isArray(profile.devices) ? profile.devices : []).some((d: any) => String(d.id) === deviceId);
      if (!hasDevice) return res.status(403).json({ error: "Forbidden", details: "Device not in your protection profile" });
      const incident = {
        id: `upr-inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: identity.userId,
        userName: identity.userName,
        deviceId,
        eventType,
        location: profile.locationConsent ? location : null,
        cameraEvidenceRef: profile.cameraEvidenceConsent ? cameraEvidenceRef : "",
        note,
        trustedFanoutTargets: Array.isArray(profile.trustedContacts)
          ? profile.trustedContacts.map((c: any) => ({ id: c.id, channel: c.channel, endpoint: c.endpoint }))
          : [],
        createdAt: Date.now(),
      };
      const incidents = Array.isArray(section.incidents) ? section.incidents : [];
      const next = {
        ...section,
        profiles,
        incidents: [incident, ...incidents].slice(0, 10000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("userProtection", next);
      appendSignedSecurityEvent("aegis.user.incident.reported", {
        userId: identity.userId,
        deviceId,
        eventType,
        withLocation: Boolean(incident.location),
        withEvidence: Boolean(incident.cameraEvidenceRef),
      });
      res.json({
        success: true,
        incident,
        note:
          "Incident recorded. Evidence/location forwarding requires user consent and compatible on-device telemetry agent.",
      });
    }
  );

  app.get(
    "/dashboard/twin/mobile/bootstrap",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const pendingActions = Array.isArray(section.pendingActions) ? section.pendingActions : [];
      const actionReceipts = Array.isArray(section.actionReceipts) ? section.actionReceipts : [];
      const isPrivileged = hasRole(req, ["founder", "admin"]);
      const visibleDevices = isPrivileged ? devices : devices.filter((d: any) => String(d.ownerUserId || "") === identity.userId);
      const visibleActions = isPrivileged
        ? pendingActions
        : pendingActions.filter((a: any) => String(a.ownerUserId || "") === identity.userId);
      const visibleReceipts = isPrivileged
        ? actionReceipts
        : actionReceipts.filter((a: any) => String(a.ownerUserId || "") === identity.userId);
      res.json({
        success: true,
        mobileTwinBridge: {
          policy: section.policy || {},
          devices: visibleDevices,
          pendingActions: visibleActions.slice(0, 500),
          actionReceipts: visibleReceipts.slice(0, 500),
          updatedAt: Number(section.updatedAt || Date.now()),
        },
      });
    }
  );

  app.post(
    "/dashboard/twin/mobile/device/register",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const input = req.body?.device || {};
      const id = String(input.id || `mtd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).trim();
      const platform = String(input.platform || "").trim().toLowerCase();
      if (!id || !platform) return res.status(400).json({ error: "Missing device id/platform" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const policy = (section.policy || {}) as Record<string, any>;
      const allowedPlatforms = Array.isArray(policy.allowedPlatforms) ? policy.allowedPlatforms : ["android", "ios"];
      if (!allowedPlatforms.includes(platform)) {
        return res.status(400).json({ error: "Unsupported platform", details: `Allowed: ${allowedPlatforms.join(", ")}` });
      }
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const exists = devices.some((d: any) => String(d.id) === id);
      const now = Date.now();
      const rec = {
        id,
        ownerUserId: String(input.ownerUserId || identity.userId),
        ownerName: String(input.ownerName || identity.userName),
        deviceName: String(input.deviceName || `${platform} device`),
        platform,
        appVersion: String(input.appVersion || ""),
        osVersion: String(input.osVersion || ""),
        pushToken: String(input.pushToken || ""),
        attestationProvider: String(input.attestationProvider || ""),
        attestationStatus: String(input.attestationStatus || "unknown"),
        permissions: {
          microphone: Boolean(input.permissions?.microphone || false),
          contacts: Boolean(input.permissions?.contacts || false),
          call_screening: Boolean(input.permissions?.call_screening || false),
          notifications: Boolean(input.permissions?.notifications || false),
          accessibility: Boolean(input.permissions?.accessibility || false),
        },
        capabilities: {
          call_assist: Boolean(input.capabilities?.call_assist || false),
          voip_answer: Boolean(input.capabilities?.voip_answer || false),
          whatsapp_call_assist: Boolean(input.capabilities?.whatsapp_call_assist || false),
          video_avatar: Boolean(input.capabilities?.video_avatar || false),
        },
        status: String(input.status || "online"),
        lastSeenAt: now,
        createdAt: exists ? Number(devices.find((d: any) => String(d.id) === id)?.createdAt || now) : now,
        updatedAt: now,
      };
      const nextDevices = exists ? devices.map((d: any) => (String(d.id) === id ? { ...d, ...rec } : d)) : [rec, ...devices];
      const next = {
        ...section,
        devices: nextDevices.slice(0, 5000),
        pendingActions: Array.isArray(section.pendingActions) ? section.pendingActions : [],
        actionReceipts: Array.isArray(section.actionReceipts) ? section.actionReceipts : [],
        policy: {
          enabled: true,
          requireAttestation: true,
          requireExplicitCallPermission: true,
          maxPendingActions: 2000,
          actionTtlMs: 24 * 60 * 60 * 1000,
          allowedPlatforms: ["android", "ios"],
          ...policy,
        },
        updatedAt: now,
      };
      mergeDashboardSection("mobileTwinBridge", next);
      auditDashboardAction(req, "twin_mobile_bridge", exists ? "device_update" : "device_register", { id, platform });
      res.json({ success: true, device: rec, mobileTwinBridge: next });
    }
  );

  app.post(
    "/dashboard/twin/mobile/device/sync",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const id = String(req.body?.deviceId || "").trim();
      if (!id) return res.status(400).json({ error: "Missing deviceId" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const idx = devices.findIndex((d: any) => String(d.id) === id);
      if (idx < 0) return res.status(404).json({ error: "Device not found" });
      const existing = devices[idx];
      if (!hasRole(req, ["founder", "admin"]) && String(existing.ownerUserId || "") !== identity.userId) {
        return res.status(403).json({ error: "Forbidden", details: "Not your device" });
      }
      const now = Date.now();
      const nextDevice = {
        ...existing,
        permissions: {
          ...(existing.permissions || {}),
          ...(req.body?.permissions || {}),
        },
        capabilities: {
          ...(existing.capabilities || {}),
          ...(req.body?.capabilities || {}),
        },
        pushToken: String(req.body?.pushToken || existing.pushToken || ""),
        attestationProvider: String(req.body?.attestationProvider || existing.attestationProvider || ""),
        attestationStatus: String(req.body?.attestationStatus || existing.attestationStatus || "unknown"),
        status: String(req.body?.status || existing.status || "online"),
        lastSeenAt: now,
        updatedAt: now,
      };
      const nextDevices = devices.map((d: any, i: number) => (i === idx ? nextDevice : d));
      const next = {
        ...section,
        devices: nextDevices,
        pendingActions: Array.isArray(section.pendingActions) ? section.pendingActions : [],
        actionReceipts: Array.isArray(section.actionReceipts) ? section.actionReceipts : [],
        policy: section.policy || {},
        updatedAt: now,
      };
      mergeDashboardSection("mobileTwinBridge", next);
      auditDashboardAction(req, "twin_mobile_bridge", "device_sync", { id });
      res.json({ success: true, device: nextDevice, mobileTwinBridge: next });
    }
  );

  app.post(
    "/dashboard/twin/mobile/action/enqueue",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const deviceId = String(req.body?.deviceId || "").trim();
      const actionType = String(req.body?.actionType || "").trim();
      if (!deviceId || !actionType) return res.status(400).json({ error: "Missing deviceId/actionType" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const device = devices.find((d: any) => String(d.id) === deviceId);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (!hasRole(req, ["founder", "admin"]) && String(device.ownerUserId || "") !== identity.userId) {
        return res.status(403).json({ error: "Forbidden", details: "Not your device" });
      }
      const policy = (section.policy || {}) as Record<string, any>;
      if (!Boolean(policy.enabled ?? true)) return res.status(400).json({ error: "Mobile bridge disabled by policy" });
      if (Boolean(policy.requireAttestation ?? true) && String(device.attestationStatus || "") !== "trusted") {
        return res.status(400).json({ error: "Device attestation required", details: "Device is not attested/trusted" });
      }
      if (
        Boolean(policy.requireExplicitCallPermission ?? true) &&
        (actionType === "answer_phone_call" || actionType === "answer_whatsapp_call" || actionType === "answer_video_call")
      ) {
        const perms = (device.permissions || {}) as Record<string, any>;
        if (!Boolean(perms.call_screening)) {
          return res.status(400).json({
            error: "Missing permission",
            details: "Call screening permission is required on device before call-assist actions",
          });
        }
      }
      const pending = Array.isArray(section.pendingActions) ? section.pendingActions : [];
      const maxPending = Math.max(100, Number(policy.maxPendingActions || 2000));
      const now = Date.now();
      const ttlMs = Math.max(60_000, Number(process.env.MOBILE_TWIN_ACTION_TTL_MS || policy.actionTtlMs || 24 * 60 * 60 * 1000));
      const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      const action = {
        id: `mta-${now}-${Math.random().toString(36).slice(2, 8)}`,
        deviceId,
        ownerUserId: String(device.ownerUserId || identity.userId),
        actionType,
        payload,
        status: "queued",
        expiresAt: now + ttlMs,
        createdAt: now,
        createdBy: req.auth?.sub || identity.userId,
      };
      const freshPending = pending.filter((a: any) => Number(a.expiresAt || 0) > now && String(a.status || "") === "queued");
      const nextPending = [action, ...freshPending].slice(0, maxPending);
      const next = {
        ...section,
        devices,
        pendingActions: nextPending,
        actionReceipts: Array.isArray(section.actionReceipts) ? section.actionReceipts : [],
        policy: {
          enabled: true,
          requireAttestation: true,
          requireExplicitCallPermission: true,
          maxPendingActions: 2000,
          actionTtlMs: 24 * 60 * 60 * 1000,
          allowedPlatforms: ["android", "ios"],
          ...policy,
        },
        updatedAt: now,
      };
      mergeDashboardSection("mobileTwinBridge", next);
      auditDashboardAction(req, "twin_mobile_bridge", "action_enqueue", { deviceId, actionType, actionId: action.id });
      res.json({ success: true, action, mobileTwinBridge: next });
    }
  );

  app.get(
    "/dashboard/twin/mobile/actions/pending",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const deviceId = String(req.query?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const device = devices.find((d: any) => String(d.id) === deviceId);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (!hasRole(req, ["founder", "admin"]) && String(device.ownerUserId || "") !== identity.userId) {
        return res.status(403).json({ error: "Forbidden", details: "Not your device" });
      }
      const now = Date.now();
      const pending = Array.isArray(section.pendingActions) ? section.pendingActions : [];
      const actions = pending.filter(
        (a: any) => String(a.deviceId) === deviceId && String(a.status || "") === "queued" && Number(a.expiresAt || 0) > now
      );
      res.json({ success: true, actions: actions.slice(0, 200) });
    }
  );

  app.post(
    "/dashboard/twin/mobile/action/receipt",
    requireWorkspace,
    requireScope("chat:write"),
    requireRole(["founder", "admin", "developer", "enterprise", "user"]),
    (req: Request, res: Response) => {
      const identity = actorDashboardIdentity(req);
      const actionId = String(req.body?.actionId || "").trim();
      const deviceId = String(req.body?.deviceId || "").trim();
      const status = String(req.body?.status || "completed").trim().toLowerCase();
      if (!actionId || !deviceId) return res.status(400).json({ error: "Missing actionId/deviceId" });
      const { dashboard } = readDashboardSummary();
      const section = (dashboard.mobileTwinBridge || {}) as Record<string, any>;
      const devices = Array.isArray(section.devices) ? section.devices : [];
      const device = devices.find((d: any) => String(d.id) === deviceId);
      if (!device) return res.status(404).json({ error: "Device not found" });
      if (!hasRole(req, ["founder", "admin"]) && String(device.ownerUserId || "") !== identity.userId) {
        return res.status(403).json({ error: "Forbidden", details: "Not your device" });
      }
      const now = Date.now();
      const pending = Array.isArray(section.pendingActions) ? section.pendingActions : [];
      const target = pending.find((a: any) => String(a.id) === actionId && String(a.deviceId) === deviceId);
      if (!target) return res.status(404).json({ error: "Action not found" });
      const nextPending = pending.map((a: any) =>
        String(a.id) === actionId ? { ...a, status: status === "failed" ? "failed" : "completed", completedAt: now } : a
      );
      const receipts = Array.isArray(section.actionReceipts) ? section.actionReceipts : [];
      const receipt = {
        id: `mtr-${now}-${Math.random().toString(36).slice(2, 8)}`,
        actionId,
        deviceId,
        ownerUserId: String(device.ownerUserId || ""),
        status: status === "failed" ? "failed" : "completed",
        result: req.body?.result || {},
        error: String(req.body?.error || ""),
        createdAt: now,
      };
      const next = {
        ...section,
        devices,
        pendingActions: nextPending,
        actionReceipts: [receipt, ...receipts].slice(0, 5000),
        policy: section.policy || {},
        updatedAt: now,
      };
      mergeDashboardSection("mobileTwinBridge", next);
      auditDashboardAction(req, "twin_mobile_bridge", "action_receipt", {
        deviceId,
        actionId,
        status: receipt.status,
      });
      res.json({ success: true, receipt, mobileTwinBridge: next });
    }
  );

  app.get(
    "/admin/dashboard/compute-payouts",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const payoutRequests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      res.json({
        success: true,
        payoutBudget: compute.payoutBudget || {},
        payoutRequests: payoutRequests.slice(0, 2000),
        autoPayoutConfig: compute.autoPayoutConfig || {},
        chainPayoutConfig: compute.chainPayoutConfig || {},
      });
    }
  );

  app.post(
    "/admin/dashboard/compute-payouts/approve",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const requestId = String(req.body?.requestId || "").trim();
      if (!requestId) return res.status(400).json({ error: "Missing requestId" });
      const settlement = String(req.body?.settlement || "scheduled").toLowerCase();
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const requests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      const budget = (compute.payoutBudget || {}) as Record<string, any>;
      let approved: any = null;
      const nextRequests = requests.map((r: any) => {
        if (String(r.id) !== requestId) return r;
        const immediateSend = settlement === "instant" || settlement === "immediate";
        approved = {
          ...r,
          status: immediateSend ? "approved_sent" : "approved_pending_payout",
          approvedAt: Date.now(),
          sentAt: immediateSend ? Date.now() : 0,
          settlement,
          txRef: immediateSend ? `txn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` : "",
          approvedBy: req.auth?.sub || "unknown",
        };
        return approved;
      });
      if (!approved) return res.status(404).json({ error: "Payout request not found" });
      const nextBudget = {
        ...budget,
        pendingUsd: Math.max(0, Number((Number(budget.pendingUsd || 0) - Number(approved.amountUsd || 0)).toFixed(2))),
        approvedUsd: Number((Number(budget.approvedUsd || 0) + Number(approved.amountUsd || 0)).toFixed(2)),
        sentUsd: Number(
          (
            Number(budget.sentUsd || 0) +
            (approved.status === "approved_sent" ? Number(approved.amountUsd || 0) : 0)
          ).toFixed(2)
        ),
        updatedAt: Date.now(),
      };
      const ledger = (dashboard.rewardsLedger || {}) as Record<string, any>;
      const wallets = Array.isArray(ledger.wallets) ? ledger.wallets : [];
      const nextWallets = wallets.map((w: any) => {
        if (String(w.userId || "").toLowerCase() !== String(approved.userId || "").toLowerCase()) return w;
        if (approved.status !== "approved_sent") return { ...w, updatedAt: Date.now() };
        return {
          ...w,
          pendingCashUsd: Math.max(0, Number((Number(w.pendingCashUsd || 0) - Number(approved.amountUsd || 0)).toFixed(2))),
          pendingWdc: Math.max(0, Number((Number(w.pendingWdc || 0) - Number(approved.amountWdc || 0)).toFixed(6))),
          points: Math.max(0, Number(w.points || 0) - Number(approved.points || 0)),
          updatedAt: Date.now(),
        };
      });
      const nextLedger = { ...ledger, wallets: nextWallets, config: ledger.config || {} };
      const nextCompute = {
        ...compute,
        payoutRequests: nextRequests,
        payoutBudget: nextBudget,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("rewardsLedger", nextLedger);
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_payouts", "approve_send", {
        requestId,
        settlement,
        status: approved.status,
        amountUsd: approved.amountUsd,
      });
      res.json({ success: true, approved, payoutBudget: nextBudget, rewardsLedger: nextLedger, computeDonation: nextCompute });
    }
  );

  app.post(
    "/admin/dashboard/compute-payouts/reject",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const requestId = String(req.body?.requestId || "").trim();
      const reason = String(req.body?.reason || "").trim();
      if (!requestId) return res.status(400).json({ error: "Missing requestId" });
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const requests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      const budget = (compute.payoutBudget || {}) as Record<string, any>;
      let rejected: any = null;
      const nextRequests = requests.map((r: any) => {
        if (String(r.id) !== requestId) return r;
        rejected = {
          ...r,
          status: "rejected",
          rejectedAt: Date.now(),
          rejectReason: reason,
          rejectedBy: req.auth?.sub || "unknown",
        };
        return rejected;
      });
      if (!rejected) return res.status(404).json({ error: "Payout request not found" });
      const nextBudget = {
        ...budget,
        pendingUsd: Math.max(0, Number((Number(budget.pendingUsd || 0) - Number(rejected.amountUsd || 0)).toFixed(2))),
        updatedAt: Date.now(),
      };
      const nextCompute = {
        ...compute,
        payoutRequests: nextRequests,
        payoutBudget: nextBudget,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_payouts", "reject", { requestId, reason });
      res.json({ success: true, rejected, payoutBudget: nextBudget, computeDonation: nextCompute });
    }
  );

  app.post(
    "/admin/dashboard/compute-payouts/budget/save",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const incoming = req.body?.budget || {};
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const current = (compute.payoutBudget || {}) as Record<string, any>;
      const nextBudget = {
        ...current,
        period: String(incoming.period || current.period || new Date().toISOString().slice(0, 7)),
        totalRevenueUsd: Math.max(0, Number(incoming.totalRevenueUsd ?? current.totalRevenueUsd ?? 0)),
        allocatedUsd: Math.max(0, Number(incoming.allocatedUsd ?? current.allocatedUsd ?? 0)),
        reserveUsd: Math.max(0, Number(incoming.reserveUsd ?? current.reserveUsd ?? 0)),
        updatedAt: Date.now(),
      };
      const nextCompute = { ...compute, payoutBudget: nextBudget, updatedAt: Date.now() };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_payouts", "budget_save", nextBudget);
      res.json({ success: true, payoutBudget: nextBudget, computeDonation: nextCompute });
    }
  );

  app.post(
    "/admin/dashboard/compute-payouts/scheduler/save",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const incoming = req.body?.scheduler || {};
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const current = (compute.autoPayoutConfig || {}) as Record<string, any>;
      const periodRaw = String(incoming.period || current.period || "weekly").toLowerCase();
      const period = ["hourly", "daily", "weekly", "monthly"].includes(periodRaw) ? periodRaw : "weekly";
      const nextScheduler = {
        ...current,
        enabled: Boolean(incoming.enabled ?? current.enabled ?? true),
        period,
        maxPayoutsPerRun: Math.max(1, Math.min(500, Number(incoming.maxPayoutsPerRun ?? current.maxPayoutsPerRun ?? 200))),
        updatedAt: Date.now(),
      };
      const nextCompute = { ...compute, autoPayoutConfig: nextScheduler, updatedAt: Date.now() };
      mergeDashboardSection("computeDonation", nextCompute);
      auditDashboardAction(req, "compute_payouts", "scheduler_save", nextScheduler);
      res.json({ success: true, scheduler: nextScheduler, computeDonation: nextCompute });
    }
  );

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
    const builtInIds = new Set(["code-linter", "analytics-plugin", "custom-commands"]);
    const normalized = extensions.map((x: any) => ({
      ...x,
      system: x?.system === true || builtInIds.has(String(x?.id || "")),
    }));
    res.json({ success: true, extensions: normalized });
  });

  app.post("/admin/dashboard/extensions/upsert", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin", "developer"]), (req: Request, res: Response) => {
    const input = req.body?.extension || {};
    const name = String(input.name || "").trim();
    if (!name) return res.status(400).json({ error: "Missing extension name" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const builtInIds = new Set(["code-linter", "analytics-plugin", "custom-commands"]);
    const id = String(input.id || `ext-${Date.now()}`);
    const existing: any = extensions.find((x: any) => String(x?.id || "") === id);
    const exists = extensions.some((x: any) => x.id === id);
    const identity = actorDashboardIdentity(req);
    const existingIsSystem = existing?.system === true || builtInIds.has(id);
    const sanitized = {
      id,
      name,
      description: String(input.description || ""),
      active: input.active !== false,
      permissions: Array.isArray(input.permissions) ? input.permissions.map((p: any) => String(p)) : [],
      version: String(input.version || "1.0.0"),
      system: existingIsSystem,
      createdBy: String(existing?.createdBy || identity.userId || ""),
      createdByName: String(existing?.createdByName || identity.userName || ""),
      createdByEmail: String(existing?.createdByEmail || actorEmail(req) || ""),
      createdAt: Number(existing?.createdAt || Date.now()),
      updatedAt: Date.now(),
    };
    const next = exists
      ? extensions.map((x: any) => (x.id === id ? { ...x, ...sanitized } : x))
      : [sanitized, ...extensions];
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", exists ? "update" : "create", { id });
    res.json({ success: true, extensions: next });
  });

  app.post("/admin/dashboard/extensions/toggle", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const next = extensions.map((x: any) => (x.id === id ? { ...x, active: !x.active, updatedAt: Date.now() } : x));
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", "toggle", { id });
    res.json({ success: true, extensions: next });
  });

  app.post("/admin/dashboard/extensions/delete", requireWorkspace, requireScope("chat:write"), requireRole(["founder", "admin", "developer", "user"]), (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { dashboard } = readDashboardSummary();
    const extensions = Array.isArray(dashboard.extensions) ? dashboard.extensions : [];
    const builtInIds = new Set(["code-linter", "analytics-plugin", "custom-commands"]);
    const target: any = extensions.find((x: any) => String(x?.id || "") === id);
    if (!target) return res.status(404).json({ error: "Extension not found" });
    if (target?.system === true || builtInIds.has(id)) {
      return res.status(403).json({ error: "System extensions cannot be deleted" });
    }
    const role = actorRole(req);
    if (role === "user") {
      const identity = actorDashboardIdentity(req);
      const actorEmailValue = actorEmail(req);
      const ownsById = String(target?.createdBy || "").toLowerCase() === String(identity.userId || "").toLowerCase();
      const ownsByEmail =
        actorEmailValue.length > 0 &&
        String(target?.createdByEmail || "").toLowerCase() === actorEmailValue.toLowerCase();
      if (!ownsById && !ownsByEmail) {
        return res.status(403).json({ error: "Users can delete only extensions they created" });
      }
    }
    const next = extensions.filter((x: any) => x.id !== id);
    mergeDashboardSection("extensions", next);
    auditDashboardAction(req, "extensions", "delete", { id });
    res.json({ success: true, extensions: next });
  });

  app.get(
    "/admin/dashboard/neuroexpansion/bootstrap",
    requireWorkspace,
    requireAnyScope(["admin:read", "chat:write"]),
    requireRole(["founder", "admin", "developer"]),
    (_req: Request, res: Response) => {
      res.json({ success: true, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/settings/save",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const settings = saveNeuroExpansionSettings(req.body?.settings || {});
      auditDashboardAction(req, "neuroexpansion", "settings.save", { settings });
      res.json({ success: true, settings, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/submit",
    requireWorkspace,
    requireAnyScope(["admin:write", "chat:write"]),
    requireRole(["founder", "admin", "developer"]),
    (req: Request, res: Response) => {
      const result = submitNeuroExpansion({
        title: String(req.body?.title || ""),
        featureText: String(req.body?.featureText || ""),
        codeText: String(req.body?.codeText || ""),
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
        orgId: String(req.auth?.orgId || "personal"),
        workspaceId: String(req.auth?.workspaceId || "default"),
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      auditDashboardAction(req, "neuroexpansion", "submit", {
        id: result.submission.id,
        severity: result.submission.scan.severity,
        status: result.submission.status,
      });
      res.json({ success: true, submission: result.submission, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/review",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const decision = String(req.body?.decision || "").toLowerCase();
      if (decision !== "approve" && decision !== "reject") {
        return res.status(400).json({ error: "decision must be approve or reject" });
      }
      const result = reviewNeuroExpansionSubmission({
        id: String(req.body?.id || ""),
        decision: decision as "approve" | "reject",
        reason: String(req.body?.reason || ""),
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
      });
      if (!result.ok) return res.status(404).json({ error: result.error });
      auditDashboardAction(req, "neuroexpansion", "review", {
        id: result.submission.id,
        decision,
      });
      res.json({ success: true, submission: result.submission, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/merge",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const result = mergeNeuroExpansionSubmission({
        id: String(req.body?.id || ""),
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
        testsRequested: Boolean(req.body?.testsRequested ?? true),
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      auditDashboardAction(req, "neuroexpansion", "merge", {
        id: result.submission.id,
        targetPath: result.submission.merge?.targetPath || "",
      });
      res.json({ success: true, submission: result.submission, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/scan-placeholders",
    requireWorkspace,
    requireAnyScope(["admin:read", "chat:write"]),
    requireRole(["founder", "admin", "developer"]),
    (req: Request, res: Response) => {
      const report = scanPlaceholderGaps();
      auditDashboardAction(req, "neuroexpansion", "scan_placeholders", {
        totalFindings: report.totalFindings,
      });
      res.json({ success: true, report, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/daily/run",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const result = runDailyNeuroExpansionPlanner();
      auditDashboardAction(req, "neuroexpansion", "daily_run", {
        skipped: Boolean((result as any).skipped),
        reason: (result as any).reason || "",
      });
      res.json({ success: true, result, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.get(
    "/admin/dashboard/neuroexpansion/notifications",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const notifications = Array.isArray(dashboard.neuroExpansionNotifications)
        ? dashboard.neuroExpansionNotifications
        : [];
      res.json({ success: true, notifications: notifications.slice(0, 200) });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/patch/preview",
    requireWorkspace,
    requireAnyScope(["admin:read", "chat:write"]),
    requireRole(["founder", "admin", "developer"]),
    async (req: Request, res: Response) => {
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ error: "Missing submission id" });
      const result = await previewSubmissionPatch(id);
      if (!result.ok) return res.status(400).json(result);
      auditDashboardAction(req, "neuroexpansion", "patch.preview", { id });
      res.json({ success: true, ...result, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/patch/apply",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ error: "Missing submission id" });
      const result = await applySubmissionPatch({
        id,
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
        runTests: Boolean(req.body?.runTests ?? true),
        testCommand: String(req.body?.testCommand || "pnpm run typecheck"),
      });
      if (!result.ok) return res.status(400).json(result);
      auditDashboardAction(req, "neuroexpansion", "patch.apply", {
        id,
        checkpointId: result.checkpoint?.id || "",
      });
      res.json({ success: true, ...result, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.post(
    "/admin/dashboard/neuroexpansion/pr/generate",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ error: "Missing submission id" });
      const result = await generateSubmissionPrDraft({
        id,
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
        baseBranch: String(req.body?.baseBranch || "main"),
        materializeBranch: Boolean(req.body?.materializeBranch ?? false),
        push: Boolean(req.body?.push ?? false),
        remote: String(req.body?.remote || "origin"),
      });
      if (!result.ok) return res.status(400).json(result);
      auditDashboardAction(req, "neuroexpansion", "pr.generate", {
        id,
        branchName: result.pr?.branchName || "",
        materialized: Boolean(result.pr?.materialized),
      });
      res.json({ success: true, ...result, neuroExpansion: getNeuroExpansionState() });
    }
  );

  app.get(
    "/admin/dashboard/mesh-expansion/bootstrap",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      res.json({
        success: true,
        meshExpansion: section,
        meshNodes: meshRegistry.list(),
      });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/policy/save",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const incoming = (req.body?.policy || {}) as Record<string, any>;
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const nextPolicy = {
        ...section.policy,
        enabled: Boolean(incoming.enabled ?? section.policy.enabled),
        autoScanEnabled: Boolean(incoming.autoScanEnabled ?? section.policy.autoScanEnabled),
        lowPowerDefault: Boolean(incoming.lowPowerDefault ?? section.policy.lowPowerDefault),
        discoveryDefault: Boolean(incoming.discoveryDefault ?? section.policy.discoveryDefault),
        requireFounderMergeApproval: Boolean(
          incoming.requireFounderMergeApproval ?? section.policy.requireFounderMergeApproval
        ),
        taskExecutionEnabled: Boolean(incoming.taskExecutionEnabled ?? section.policy.taskExecutionEnabled),
        maxTaskRetries: Math.max(0, Math.min(5, Number(incoming.maxTaskRetries ?? section.policy.maxTaskRetries ?? 2))),
      };
      const nextP2pPolicy = {
        ...(section.p2p?.policy || {}),
        enabled: Boolean(incoming?.p2p?.enabled ?? section.p2p?.policy?.enabled ?? true),
        allowStoreAndForward: Boolean(
          incoming?.p2p?.allowStoreAndForward ?? section.p2p?.policy?.allowStoreAndForward ?? true
        ),
        maxHops: Math.max(2, Math.min(32, Number(incoming?.p2p?.maxHops ?? section.p2p?.policy?.maxHops ?? 8))),
        gossipFanout: Math.max(
          1,
          Math.min(10, Number(incoming?.p2p?.gossipFanout ?? section.p2p?.policy?.gossipFanout ?? 3))
        ),
      };
      const next = {
        ...section,
        policy: nextPolicy,
        p2p: {
          ...(section.p2p || {}),
          policy: nextP2pPolicy,
        },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "policy_save", { mesh: nextPolicy, p2p: nextP2pPolicy });
      res.json({ success: true, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/p2p/peer/upsert",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const input = (req.body?.peer || {}) as Record<string, any>;
      const id = String(input.id || `peer-${Date.now()}`).trim();
      if (!id) return res.status(400).json({ error: "Missing peer id" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const peers = Array.isArray(section.p2p?.peers) ? section.p2p.peers : [];
      const exists = peers.some((p: any) => String(p.id) === id);
      const peer = {
        id,
        nodeId: String(input.nodeId || id),
        label: String(input.label || id),
        transport: String(input.transport || "hybrid"),
        status: String(input.status || "active"),
        bandwidthKbps: Math.max(1, Number(input.bandwidthKbps || 256)),
        latencyMs: Math.max(0, Number(input.latencyMs || 0)),
        batteryAware: Boolean(input.batteryAware ?? true),
        lastSeen: Date.now(),
      };
      const nextPeers = exists ? peers.map((p: any) => (String(p.id) === id ? { ...p, ...peer } : p)) : [peer, ...peers];
      const next = {
        ...section,
        p2p: { ...(section.p2p || {}), peers: nextPeers },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", exists ? "p2p_peer_update" : "p2p_peer_add", { id });
      res.json({ success: true, meshExpansion: next, peer });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/p2p/link/upsert",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const input = (req.body?.link || {}) as Record<string, any>;
      const from = String(input.from || "").trim();
      const to = String(input.to || "").trim();
      if (!from || !to || from === to) return res.status(400).json({ error: "Invalid from/to for link" });
      const id = String(input.id || `link-${from}-${to}`).trim();
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const links = Array.isArray(section.p2p?.links) ? section.p2p.links : [];
      const exists = links.some((l: any) => String(l.id) === id);
      const link = {
        id,
        from,
        to,
        status: String(input.status || "active"),
        quality: Math.max(0, Math.min(1, Number(input.quality ?? 0.8))),
        cost: Math.max(0, Number(input.cost ?? 1)),
        lastUpdatedAt: Date.now(),
      };
      const nextLinks = exists ? links.map((l: any) => (String(l.id) === id ? { ...l, ...link } : l)) : [link, ...links];
      const next = {
        ...section,
        p2p: { ...(section.p2p || {}), links: nextLinks },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", exists ? "p2p_link_update" : "p2p_link_add", { id, from, to });
      res.json({ success: true, meshExpansion: next, link });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/p2p/gossip",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const topic = String(req.body?.topic || "mesh.health").trim();
      const payload = (req.body?.payload || {}) as Record<string, any>;
      const fromPeerId = String(req.body?.fromPeerId || "").trim();
      if (!topic) return res.status(400).json({ error: "Missing topic" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const peers = Array.isArray(section.p2p?.peers) ? section.p2p.peers : [];
      const activePeers = peers.filter((p: any) => String(p.status || "active") === "active");
      const fanout = Math.max(1, Math.min(10, Number(section.p2p?.policy?.gossipFanout || 3)));
      const targets = activePeers
        .filter((p: any) => String(p.id) !== fromPeerId)
        .slice(0, fanout)
        .map((p: any) => String(p.id));
      const entry = {
        id: `gossip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        topic,
        payload,
        fromPeerId: fromPeerId || "mesh-admin",
        targets,
        createdAt: Date.now(),
      };
      const next = {
        ...section,
        p2p: {
          ...(section.p2p || {}),
          gossipLog: [entry, ...(section.p2p?.gossipLog || [])].slice(0, 3000),
        },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      appendEvent({ type: "mesh.p2p.gossip", timestamp: Date.now(), payload: entry });
      res.json({ success: true, gossip: entry, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/p2p/route/send",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const fromPeerId = String(req.body?.fromPeerId || "").trim();
      const toPeerId = String(req.body?.toPeerId || "").trim();
      const payload = req.body?.payload ?? {};
      if (!fromPeerId || !toPeerId) return res.status(400).json({ error: "Missing fromPeerId or toPeerId" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const p2p = section.p2p || {};
      const peers = Array.isArray(p2p.peers) ? p2p.peers : [];
      const links = Array.isArray(p2p.links) ? p2p.links : [];
      const maxHops = Math.max(2, Number(p2p.policy?.maxHops || 8));
      const adj = buildP2PAdjacency(peers, links);
      const route = findP2PRoute(adj, fromPeerId, toPeerId, maxHops);
      const storeForward = Boolean(p2p.policy?.allowStoreAndForward ?? true);
      const packet = {
        id: `pkt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromPeerId,
        toPeerId,
        payload,
        route,
        status: route.length > 0 ? "delivered" : storeForward ? "queued" : "undeliverable",
        hops: Math.max(0, route.length - 1),
        createdAt: Date.now(),
      };
      const next = {
        ...section,
        p2p: {
          ...p2p,
          packets: [packet, ...(p2p.packets || [])].slice(0, 5000),
        },
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      appendEvent({
        type: "mesh.p2p.packet",
        timestamp: Date.now(),
        payload: { id: packet.id, status: packet.status, hops: packet.hops, fromPeerId, toPeerId },
      });
      res.json({ success: true, packet, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/scan",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const nodes = meshRegistry.list();
      const online = nodes.filter((n) => n.online);
      const consentedCompute = nodes.filter((n) => Boolean(n.consentCompute)).length;
      const consentedTraining = nodes.filter((n) => Boolean(n.consentTraining)).length;
      const avgLatencyMs = online.length
        ? Number(
            (
              online.reduce((acc, n) => acc + Number(n.lastLatencyMs || 0), 0) /
              Math.max(1, online.length)
            ).toFixed(2)
          )
        : 0;
      const scan = {
        id: `mesh-scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        summary: {
          totalNodes: nodes.length,
          onlineNodes: online.length,
          offlineNodes: Math.max(0, nodes.length - online.length),
          consentedComputeNodes: consentedCompute,
          consentedTrainingNodes: consentedTraining,
          avgLatencyMs,
        },
        findings: [
          online.length === 0 ? "No live mesh nodes currently online." : "",
          consentedCompute === 0
            ? "No nodes have compute consent; mesh can only run discovery until users opt in."
            : "",
          consentedTraining === 0
            ? "No nodes have training consent; federated training signals are blocked."
            : "",
        ].filter(Boolean),
        recommendations: [
          "Enable compute consent only for devices that accept rewards and task execution.",
          "Keep discovery and low-power mode enabled to maintain offline communication fabric.",
          "Use task retries and failover to mimic cloud-grade execution resilience.",
        ],
      };
      const next = {
        ...section,
        scans: [scan, ...section.scans].slice(0, 300),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "scan", scan.summary);
      res.json({ success: true, scan, meshExpansion: next, meshNodes: nodes });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/propose",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const assistantId = String(req.body?.assistantId || "mesh-architect").trim();
      const goal = String(req.body?.goal || "improve mesh resilience").trim();
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const nodes = meshRegistry.list();
      const proposal = {
        id: `mesh-proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        assistantId,
        goal,
        status: "pending_founder_approval",
        createdAt: Date.now(),
        createdBy: String(req.auth?.sub || "unknown"),
        plan: {
          generatedModules: [
            "orchestrator/src/mesh/optimizer/topology_optimizer.ts",
            "orchestrator/src/mesh/reliability/failover_scheduler.ts",
          ],
          steps: [
            "scan mesh topology and identify blind spots",
            "propose failover + retry strategy for offline-first execution",
            "require founder approval before merge",
          ],
          impactEstimate: {
            currentNodes: nodes.length,
            targetOfflineResiliencePct: 99.0,
          },
        },
        review: {
          requiredRole: "founder",
          approvedBy: "",
          approvedAt: 0,
          rejectedReason: "",
        },
      };
      const next = {
        ...section,
        proposals: [proposal, ...section.proposals].slice(0, 1000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "proposal_create", {
        id: proposal.id,
        assistantId,
        goal,
      });
      res.json({ success: true, proposal, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/review",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.id || "").trim();
      const decision = String(req.body?.decision || "").toLowerCase();
      const reason = String(req.body?.reason || "").trim();
      if (!id || !["approve", "reject"].includes(decision)) {
        return res.status(400).json({ error: "Missing id or invalid decision" });
      }
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const role = actorRole(req);
      const founderRequired = Boolean(section.policy?.requireFounderMergeApproval);
      if (decision === "approve" && founderRequired && role !== "founder") {
        return res.status(403).json({
          error: "Founder approval required",
          details: "Only founder can approve mesh expansion proposals when strict founder gate is enabled.",
        });
      }
      const proposals = section.proposals.map((p: any) => {
        if (String(p.id) !== id) return p;
        if (decision === "approve") {
          return {
            ...p,
            status: "approved",
            review: {
              ...(p.review || {}),
              approvedBy: String(req.auth?.sub || "unknown"),
              approvedAt: Date.now(),
              rejectedReason: "",
            },
          };
        }
        return {
          ...p,
          status: "rejected",
          review: {
            ...(p.review || {}),
            rejectedReason: reason || "rejected",
          },
        };
      });
      const target = proposals.find((p: any) => String(p.id) === id);
      if (!target) return res.status(404).json({ error: "Proposal not found" });
      const next = {
        ...section,
        proposals,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "proposal_review", { id, decision, reason });
      res.json({ success: true, proposal: target, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/merge",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder"]),
    (req: Request, res: Response) => {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ error: "Missing proposal id" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const target = section.proposals.find((p: any) => String(p.id) === id);
      if (!target) return res.status(404).json({ error: "Proposal not found" });
      if (!["approved", "merged"].includes(String(target.status || ""))) {
        return res.status(400).json({ error: "Proposal must be approved before merge" });
      }
      const generatedCode = [
        `// Mesh Expansion Proposal: ${target.id}`,
        `// Goal: ${target.goal}`,
        ...(Array.isArray(target?.plan?.steps) ? target.plan.steps.map((s: string) => `// - ${s}`) : []),
        "",
        "export const meshExpansionProposal = {",
        `  id: ${JSON.stringify(String(target.id))},`,
        `  goal: ${JSON.stringify(String(target.goal || ""))},`,
        `  mergedAt: ${Date.now()},`,
        `  mergedBy: ${JSON.stringify(String(req.auth?.sub || "unknown"))},`,
        "};",
      ].join("\n");
      const handoff = submitNeuroExpansion({
        title: `Mesh Expansion ${target.id}`,
        featureText: `Mesh expansion proposal merged via founder approval.\nGoal: ${String(target.goal || "")}`,
        codeText: generatedCode,
        actor: String(req.auth?.sub || "unknown"),
        role: actorRole(req),
        orgId: String(req.auth?.orgId || "personal"),
        workspaceId: String(req.auth?.workspaceId || "default"),
      });
      const neuroExpansionSubmissionId = handoff.ok ? String(handoff.submission.id) : "";
      const proposals = section.proposals.map((p: any) =>
        String(p.id) === id
          ? {
              ...p,
              status: "merged",
              mergedAt: Date.now(),
              mergedBy: String(req.auth?.sub || "unknown"),
              neuroExpansionSubmissionId,
            }
          : p
      );
      const next = {
        ...section,
        proposals,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "proposal_merge", { id });
      res.json({
        success: true,
        proposal: proposals.find((p: any) => String(p.id) === id) || null,
        neuroExpansionSubmissionId,
        mergeNote:
          "Merged into mesh roadmap and handed off to NeuroExpansion queue for guarded patch flow.",
        meshExpansion: next,
      });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/task/submit-async",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const command = String(req.body?.command || "").trim();
      const payload = (req.body?.payload || {}) as Record<string, any>;
      if (!command) return res.status(400).json({ error: "Missing command" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      if (!Boolean(section.policy?.taskExecutionEnabled)) {
        return res.status(403).json({ error: "Mesh task execution is disabled by policy" });
      }
      const task = {
        id: `mesh-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        command,
        payload,
        targetNodeId: "",
        status: "queued",
        attempts: 0,
        maxRetries: Math.max(0, Number(section.policy?.maxTaskRetries || 2)),
        createdBy: String(req.auth?.sub || "unknown"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: null as any,
      };
      const next = {
        ...section,
        tasks: [task, ...section.tasks].slice(0, 4000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "task_queue", { id: task.id, command });
      res.json({ success: true, task, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/task/dispatch",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const limit = Math.max(1, Math.min(30, Number(req.body?.limit || 5)));
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      const tasks = Array.isArray(section.tasks) ? [...section.tasks] : [];
      const queued = tasks.filter((t: any) => String(t.status) === "queued").slice(0, limit);
      const onlineNodes = meshRegistry
        .list()
        .filter((n) => Boolean(n.online) && Boolean(n.consentCompute) && (n.capabilities || []).includes("infer"));
      if (onlineNodes.length === 0) {
        return res.status(503).json({ error: "No compute-consented mesh node available for dispatch" });
      }
      let rr = 0;
      const updated: any[] = [];
      for (const task of queued) {
        let attempts = Number(task.attempts || 0);
        let success = false;
        let lastErr = "";
        let targetNodeId = String(task.targetNodeId || "");
        while (!success && attempts <= Number(task.maxRetries || 0)) {
          const node = onlineNodes[rr % onlineNodes.length];
          rr += 1;
          attempts += 1;
          targetNodeId = node.id;
          try {
            const base = String(node.baseUrl || "").replace(/\/$/, "");
            const run = await axios.post(
              `${base}/infer`,
              { command: task.command, ...(task.payload || {}) },
              { timeout: 20000 }
            );
            updated.push({
              ...task,
              status: "completed",
              attempts,
              targetNodeId,
              result: run.data,
              updatedAt: Date.now(),
            });
            success = true;
          } catch (err: any) {
            lastErr = err?.message || String(err);
          }
        }
        if (!success) {
          updated.push({
            ...task,
            status: "failed",
            attempts,
            targetNodeId,
            result: { error: lastErr || "dispatch failed" },
            updatedAt: Date.now(),
          });
        }
      }
      const updatedById = new Map(updated.map((u: any) => [String(u.id), u]));
      const nextTasks = tasks.map((t: any) => updatedById.get(String(t.id)) || t);
      const next = {
        ...section,
        tasks: nextTasks,
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "task_dispatch", {
        processed: updated.length,
        completed: updated.filter((u: any) => String(u.status) === "completed").length,
      });
      res.json({ success: true, updated, meshExpansion: next });
    }
  );

  app.post(
    "/admin/dashboard/mesh-expansion/task/submit",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    async (req: Request, res: Response) => {
      const command = String(req.body?.command || "").trim();
      const payload = (req.body?.payload || {}) as Record<string, any>;
      if (!command) return res.status(400).json({ error: "Missing command" });
      const { dashboard } = readDashboardSummary();
      const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
      if (!Boolean(section.policy?.taskExecutionEnabled)) {
        return res.status(403).json({ error: "Mesh task execution is disabled by policy" });
      }
      const node = meshRegistry.pickNodeWhere(
        (n) => Boolean(n.online) && Boolean(n.consentCompute) && (n.capabilities || []).includes("infer")
      );
      if (!node) {
        return res.status(503).json({
          error: "No compute-consented mesh node available",
          details: "Tasks require a live node with compute consent enabled.",
        });
      }
      const task = {
        id: `mesh-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        command,
        payload,
        targetNodeId: node.id,
        status: "running",
        attempts: 1,
        maxRetries: Math.max(0, Number(section.policy?.maxTaskRetries || 2)),
        createdBy: String(req.auth?.sub || "unknown"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: null as any,
      };
      let finalTask = { ...task };
      try {
        const base = String(node.baseUrl || "").replace(/\/$/, "");
        const execResp = await axios.post(
          `${base}/execute`,
          { command, args: Array.isArray(payload?.args) ? payload.args : [], payload },
          { timeout: 20000 }
        );
        finalTask = {
          ...finalTask,
          status: "completed",
          result: execResp.data,
          updatedAt: Date.now(),
        };
      } catch (err: any) {
        try {
          const inferResp = await axios.post(
            `${String(node.baseUrl || "").replace(/\/$/, "")}/infer`,
            { command, ...(payload || {}) },
            { timeout: 20000 }
          );
          finalTask = {
            ...finalTask,
            status: "completed",
            result: inferResp.data,
            updatedAt: Date.now(),
          };
        } catch (err2: any) {
          finalTask = {
            ...finalTask,
            status: "failed",
            result: {
              error: err2?.message || err?.message || "Mesh task execution failed",
            },
            updatedAt: Date.now(),
          };
        }
      }
      const next = {
        ...section,
        tasks: [finalTask, ...section.tasks].slice(0, 2000),
        updatedAt: Date.now(),
      };
      mergeDashboardSection("meshExpansion", next);
      auditDashboardAction(req, "mesh_expansion", "task_submit", {
        id: finalTask.id,
        command,
        targetNodeId: node.id,
        status: finalTask.status,
      });
      res.json({ success: true, task: finalTask, meshExpansion: next });
    }
  );

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

  app.get("/neurotwin/channels/bootstrap", requireWorkspace, requireScope("chat:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/channels/bootstrap`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin channel bootstrap failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/channels/connect", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/channels/connect`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin channel connect failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/channels/disconnect", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/channels/disconnect`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin channel disconnect failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/channels/policy", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/channels/policy`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin channel policy failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/availability", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/availability`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin availability update failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/auto-reply/draft", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/auto-reply/draft`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin auto-reply draft failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/auto-reply/approve", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/auto-reply/approve`, req.body || {}, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin auto-reply approve failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/auto-reply/logs", requireWorkspace, requireScope("chat:read"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    const limit = Number(req.query?.limit || 50);
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/auto-reply/logs`, {
        timeout: 45000,
        params: { limit: Number.isFinite(limit) ? limit : 50 },
      });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin auto-reply logs failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/market-map", requireWorkspace, requireScope("chat:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/market-map`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin market map failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/channels/send-test", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/channels/send-test`, req.body || {}, {
        timeout: 45000,
      });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin channel send test failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/call-assistant/config", requireWorkspace, requireScope("chat:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/call-assistant/config`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin call assistant config failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/call-assistant/config", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/call-assistant/config`, req.body || {}, {
        timeout: 45000,
      });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin call assistant config save failed", detail: err?.message || String(err) });
    }
  });

  app.get("/neurotwin/clone/customization", requireWorkspace, requireScope("chat:read"), async (_req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.get(`${mlBase.replace(/\/$/, "")}/neurotwin/clone/customization`, { timeout: 45000 });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin clone customization failed", detail: err?.message || String(err) });
    }
  });

  app.post("/neurotwin/clone/customization", requireWorkspace, requireScope("chat:write"), async (req: Request, res: Response) => {
    const mlBase = process.env.ML_URL || "http://localhost:8090";
    try {
      const resp = await axios.post(`${mlBase.replace(/\/$/, "")}/neurotwin/clone/customization`, req.body || {}, {
        timeout: 45000,
      });
      res.json(resp.data);
    } catch (err: any) {
      res.status(502).json({ error: "NeuroTwin clone customization save failed", detail: err?.message || String(err) });
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
    const { id, baseUrl, kind, capabilities, policy } = req.body || {};
    if (!id || !baseUrl) {
      return res.status(400).json({ error: "Missing id or baseUrl" });
    }
    const nodePolicy = {
      consentCompute: Boolean(policy?.consentCompute),
      consentTraining: Boolean(policy?.consentTraining),
      discoveryEnabled: Boolean(policy?.discoveryEnabled ?? true),
      lowPowerMode: Boolean(policy?.lowPowerMode ?? true),
    };
    meshRegistry.register({
      id,
      baseUrl,
      kind: kind || "unknown",
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      ...nodePolicy,
    } as InferenceNode);
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok", policy: nodePolicy });
  });

  app.post("/mesh/heartbeat", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    meshRegistry.heartbeat(id);
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok" });
  });

  app.post("/mesh/metrics", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id, latency_ms, load, cache_size, policy } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    meshRegistry.updateMetrics(id, {
      latencyMs: typeof latency_ms === "number" ? latency_ms : undefined,
      load: typeof load === "number" ? load : undefined,
      cacheSize: typeof cache_size === "number" ? cache_size : undefined,
    });
    if (policy && typeof policy === "object") {
      const node = meshRegistry.get(id);
      if (node) {
        meshRegistry.register({
          id: node.id,
          baseUrl: node.baseUrl,
          kind: node.kind,
          capabilities: node.capabilities || [],
          consentCompute: Boolean(policy?.consentCompute ?? node.consentCompute),
          consentTraining: Boolean(policy?.consentTraining ?? node.consentTraining),
          discoveryEnabled: Boolean(policy?.discoveryEnabled ?? node.discoveryEnabled ?? true),
          lowPowerMode: Boolean(policy?.lowPowerMode ?? node.lowPowerMode ?? true),
        });
      }
    }
    setMeshNodesOnline(meshRegistry.list().filter((n) => n.online).length);
    res.json({ status: "ok" });
  });

  app.post("/mesh/train-signal", requireScope("mesh:write"), (req: Request, res: Response) => {
    const { id, signal } = req.body || {};
    if (!id || !signal) return res.status(400).json({ error: "Missing id or signal" });
    const node = meshRegistry.get(id);
    if (!node || !node.online) {
      return res.status(404).json({ error: "Node not found or offline" });
    }
    if (!Boolean(node.consentTraining)) {
      return res.status(403).json({
        error: "Training consent required",
        code: "mesh_training_consent_required",
        node: id,
      });
    }
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
    const node = meshRegistry.pickNodeWhere(
      (n) => Boolean(n.discoveryEnabled ?? true) && Boolean(n.consentCompute) && (n.capabilities || []).includes("infer")
    );
    if (!node) {
      return res.status(403).json({
        error: "No consented mesh nodes available",
        code: "mesh_compute_consent_required",
        detail: "Mesh discovery can run in low-power mode, but compute inference requires explicit consent.",
      });
    }
    try {
      const response = await axios.post(`${node.baseUrl.replace(/\/$/, "")}/infer`, req.body || {});
      res.json({ node: node.id, result: response.data });
    } catch (err: any) {
      res.status(502).json({ error: "Mesh node inference failed", detail: err?.message || String(err) });
    }
  });

  app.post("/mesh/message/relay", requireScope("mesh:write"), (req: Request, res: Response) => {
    const fromNodeId = String(req.body?.fromNodeId || "").trim();
    const toNodeId = String(req.body?.toNodeId || "").trim();
    const channel = String(req.body?.channel || "mesh").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();
    if (!fromNodeId || !toNodeId || !message) {
      return res.status(400).json({ error: "Missing fromNodeId, toNodeId, or message" });
    }
    const { dashboard } = readDashboardSummary();
    const section = normalizeMeshExpansionSection((dashboard.meshExpansion || {}) as Record<string, any>);
    const rec = {
      id: `mesh-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromNodeId,
      toNodeId,
      channel,
      message,
      status: "relayed",
      createdAt: Date.now(),
    };
    const next = {
      ...section,
      relayMessages: [rec, ...(section.relayMessages || [])].slice(0, 5000),
      updatedAt: Date.now(),
    };
    mergeDashboardSection("meshExpansion", next);
    appendEvent({
      type: "mesh.message.relay",
      timestamp: Date.now(),
      payload: { fromNodeId, toNodeId, channel, messageLen: message.length },
    });
    res.json({ status: "ok", relay: rec });
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
    "/admin/reliability/program",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      const state = readState() as any;
      const program = state.reliabilityProgram || {
        slo: {
          availabilityPct: 99.9,
          p95LatencyMs: 2500,
          errorBudgetPct: 0.1,
          windowDays: 30,
          owner: "sre",
          updatedAt: 0,
        },
        canary: {
          enabled: true,
          trafficPct: 5,
          autoRollback: true,
          lastRun: null,
        },
        statusPage: {
          mode: "operational",
          message: "All systems operational.",
          updatedAt: 0,
        },
        incidents: [],
      };
      res.json({ success: true, program });
    }
  );

  app.post(
    "/admin/reliability/slo",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const prev = (readState() as any).reliabilityProgram || {};
      const incoming = req.body?.slo || {};
      const slo = {
        availabilityPct: Math.max(90, Math.min(100, Number(incoming.availabilityPct ?? 99.9))),
        p95LatencyMs: Math.max(100, Number(incoming.p95LatencyMs ?? 2500)),
        errorBudgetPct: Math.max(0.01, Math.min(10, Number(incoming.errorBudgetPct ?? 0.1))),
        windowDays: Math.max(1, Math.min(365, Number(incoming.windowDays ?? 30))),
        owner: String(incoming.owner || "sre"),
        updatedAt: Date.now(),
      };
      const next = { ...prev, slo };
      writeState({ reliabilityProgram: next });
      appendEvent({
        type: "reliability.slo.updated",
        timestamp: Date.now(),
        payload: { actor: req.auth?.sub || "unknown", role: actorRole(req), slo },
      });
      res.json({ success: true, slo });
    }
  );

  app.post(
    "/admin/reliability/canary/run",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const prev = (readState() as any).reliabilityProgram || {};
      const baseline = buildReliabilitySnapshot(24);
      const trafficPct = Math.max(1, Math.min(100, Number(req.body?.trafficPct ?? prev?.canary?.trafficPct ?? 5)));
      const autoRollback = Boolean(req.body?.autoRollback ?? prev?.canary?.autoRollback ?? true);
      const rollbackTriggered =
        Number(baseline.successRate || 1) < 0.985 ||
        Number(baseline.errorRate || 0) > 0.015 ||
        Number(baseline.p95LatencyMs || 0) > 3000;
      const result = {
        id: `canary-${Date.now()}`,
        trafficPct,
        autoRollback,
        rollbackTriggered: autoRollback && rollbackTriggered,
        health: baseline,
        recommendedAction:
          autoRollback && rollbackTriggered
            ? "rollback_to_previous_stable"
            : "promote_or_continue_observation",
        at: Date.now(),
      };
      const canary = {
        enabled: true,
        trafficPct,
        autoRollback,
        lastRun: result,
      };
      const next = { ...prev, canary };
      writeState({ reliabilityProgram: next });
      appendEvent({
        type: "reliability.canary.run",
        timestamp: Date.now(),
        payload: { actor: req.auth?.sub || "unknown", role: actorRole(req), result },
      });
      res.json({ success: true, result, canary });
    }
  );

  app.post(
    "/admin/reliability/status-page",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const prev = (readState() as any).reliabilityProgram || {};
      const modeRaw = String(req.body?.mode || prev?.statusPage?.mode || "operational");
      const mode = ["operational", "degraded", "major_outage", "maintenance"].includes(modeRaw)
        ? modeRaw
        : "operational";
      const statusPage = {
        mode,
        message: String(req.body?.message || prev?.statusPage?.message || "Status updated."),
        updatedAt: Date.now(),
      };
      const next = { ...prev, statusPage };
      writeState({ reliabilityProgram: next });
      appendEvent({
        type: "reliability.status_page.updated",
        timestamp: Date.now(),
        payload: { actor: req.auth?.sub || "unknown", role: actorRole(req), statusPage },
      });
      res.json({ success: true, statusPage });
    }
  );

  app.post(
    "/admin/reliability/incident",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const prev = (readState() as any).reliabilityProgram || {};
      const incidents = Array.isArray(prev?.incidents) ? prev.incidents : [];
      const incident = {
        id: `inc-${Date.now()}`,
        title: String(req.body?.title || "Unnamed incident"),
        severity: ["sev1", "sev2", "sev3", "sev4"].includes(String(req.body?.severity || "sev3"))
          ? String(req.body?.severity)
          : "sev3",
        status: ["open", "monitoring", "resolved"].includes(String(req.body?.status || "open"))
          ? String(req.body?.status)
          : "open",
        summary: String(req.body?.summary || ""),
        owner: String(req.body?.owner || req.auth?.sub || "oncall"),
        createdAt: Date.now(),
      };
      const next = { ...prev, incidents: [incident, ...incidents].slice(0, 200) };
      writeState({ reliabilityProgram: next });
      appendEvent({
        type: "reliability.incident.created",
        timestamp: Date.now(),
        payload: { actor: req.auth?.sub || "unknown", role: actorRole(req), incident },
      });
      res.json({ success: true, incident });
    }
  );

  app.get(
    "/admin/market-readiness/config",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      res.json({
        success: true,
        config: getMarketReadinessConfig(),
      });
    }
  );

  app.post(
    "/admin/market-readiness/config",
    requireWorkspace,
    requireScope("admin:write"),
    requireRole(["founder", "admin"]),
    (req: Request, res: Response) => {
      const config = updateMarketReadinessConfig(req.body || {});
      appendEvent({
        type: "admin.market_readiness.updated",
        timestamp: Date.now(),
        payload: {
          actor: req.auth?.sub || "unknown",
          role: actorRole(req),
          config,
        },
      });
      res.json({ success: true, config });
    }
  );

  app.get(
    "/admin/market-readiness/summary",
    requireWorkspace,
    requireScope("admin:read"),
    requireRole(["founder", "admin"]),
    (_req: Request, res: Response) => {
      const trust = buildTrustSignalsSummary(72);
      const reliability = buildReliabilitySnapshot(24);
      const retrieval = buildRetrievalFreshnessSummary(72);
      const benchmarkRegression = computeBenchmarkRegression(30);
      const config = getMarketReadinessConfig();
      res.json({
        success: true,
        summary: {
          config,
          trust,
          reliability,
          retrieval,
          benchmarkRegression,
          readinessScore: Number(
            (
              ((1 - Number(trust.hallucinationRiskScore || 1)) * 0.35) +
              (Number(reliability.successRate || 0) * 0.35) +
              ((1 - Number(retrieval.staleCitationRate || 1)) * 0.3)
            ).toFixed(4)
          ),
        },
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
  let payoutSchedulerRunning = false;
  let payoutSchedulerLastTickAt = 0;

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

  const runAutoPayoutScheduler = async () => {
    if (payoutSchedulerRunning) return;
    const tickMs = Math.max(30_000, Number(process.env.AUTO_PAYOUT_TICK_MS || 60_000));
    const nowMs = Date.now();
    if (nowMs - payoutSchedulerLastTickAt < tickMs) return;
    payoutSchedulerLastTickAt = nowMs;
    payoutSchedulerRunning = true;
    try {
      const { dashboard } = readDashboardSummary();
      const compute = (dashboard.computeDonation || {}) as Record<string, any>;
      const rewardsLedger = (dashboard.rewardsLedger || {}) as Record<string, any>;
      const requests = Array.isArray(compute.payoutRequests) ? compute.payoutRequests : [];
      const pending = requests.filter((r: any) => String(r.status || "") === "approved_pending_payout");
      if (pending.length === 0) return;
      const config = (compute.autoPayoutConfig || {}) as Record<string, any>;
      const period = String(
        config.period ||
          dashboard?.cryptoRewards?.payoutSchedule ||
          process.env.AUTO_PAYOUT_PERIOD ||
          "weekly"
      ).toLowerCase();
      const enabled = Boolean(config.enabled ?? boolEnv("AUTO_PAYOUT_ENABLED", true));
      if (!enabled) return;
      const bucket = payoutPeriodBucket(period);
      if (String(config.lastRunBucket || "") === bucket) return;
      const maxPayoutsPerRun = Math.max(1, Math.min(500, Number(config.maxPayoutsPerRun || 200)));
      const processSet = pending
        .sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .slice(0, maxPayoutsPerRun);
      const processIds = new Set(processSet.map((r: any) => String(r.id)));
      let sentUsdDelta = 0;
      const nextRequests = requests.map((r: any) => {
        if (!processIds.has(String(r.id))) return r;
        sentUsdDelta += Number(r.amountUsd || 0);
        return {
          ...r,
          status: "approved_sent",
          sentAt: nowMs,
          settlement: "scheduled_auto",
          txRef: `auto-${nowMs}-${Math.random().toString(36).slice(2, 9)}`,
          schedulerBucket: bucket,
        };
      });
      const wallets = Array.isArray(rewardsLedger.wallets) ? rewardsLedger.wallets : [];
      const deltas = new Map<string, { usd: number; wdc: number; points: number }>();
      for (const row of processSet) {
        const userId = String(row.userId || "").toLowerCase();
        const curr = deltas.get(userId) || { usd: 0, wdc: 0, points: 0 };
        curr.usd += Number(row.amountUsd || 0);
        curr.wdc += Number(row.amountWdc || 0);
        curr.points += Number(row.points || 0);
        deltas.set(userId, curr);
      }
      const nextWallets = wallets.map((w: any) => {
        const d = deltas.get(String(w.userId || "").toLowerCase());
        if (!d) return w;
        return {
          ...w,
          pendingCashUsd: Math.max(0, Number((Number(w.pendingCashUsd || 0) - d.usd).toFixed(2))),
          pendingWdc: Math.max(0, Number((Number(w.pendingWdc || 0) - d.wdc).toFixed(6))),
          points: Math.max(0, Number(w.points || 0) - d.points),
          updatedAt: nowMs,
        };
      });
      const budget = (compute.payoutBudget || {}) as Record<string, any>;
      const nextBudget = {
        ...budget,
        sentUsd: Number((Number(budget.sentUsd || 0) + sentUsdDelta).toFixed(2)),
        updatedAt: nowMs,
      };
      const nextCompute = {
        ...compute,
        payoutRequests: nextRequests,
        payoutBudget: nextBudget,
        autoPayoutConfig: {
          ...config,
          enabled,
          period,
          maxPayoutsPerRun,
          lastRunBucket: bucket,
          lastRunAt: nowMs,
        },
        updatedAt: nowMs,
      };
      const nextLedger = { ...rewardsLedger, wallets: nextWallets, config: rewardsLedger.config || {} };
      mergeDashboardSection("rewardsLedger", nextLedger);
      mergeDashboardSection("computeDonation", nextCompute);
      appendEvent({
        type: "compute.payout.scheduler.run",
        timestamp: nowMs,
        payload: {
          period,
          bucket,
          processed: processSet.length,
          sentUsdDelta: Number(sentUsdDelta.toFixed(2)),
        },
      });
    } catch (err: any) {
      appendEvent({
        type: "compute.payout.scheduler.error",
        timestamp: Date.now(),
        payload: { error: err?.message || String(err) },
      });
    } finally {
      payoutSchedulerRunning = false;
    }
  };

  setInterval(() => {
    void runNightlyAutoRefresh();
  }, 30_000);

  setInterval(() => {
    void runNightlyAutoEval();
  }, 30_000);

  setInterval(() => {
    void runAutoPayoutScheduler();
  }, 30_000);

  setInterval(() => {
    try {
      runDailyNeuroExpansionPlanner();
    } catch (err: any) {
      appendEvent({
        type: "neuroexpansion.daily.error",
        timestamp: Date.now(),
        payload: { error: err?.message || String(err) },
      });
    }
  }, 15 * 60 * 1000);

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
