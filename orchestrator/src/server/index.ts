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
import { exportTrainingJSONL, listTrainingSamples, recordTrainingSample } from "@training/dataset";
import {
  doctrineShieldMiddleware,
  doctrineVersion,
  listDoctrineRules,
  upsertDoctrineRule,
} from "@security/doctrineShield";
import {
  analyzeWorkspace,
  buildExpansionProposal,
  generateModuleWithConfirmation,
} from "@core/selfExpansion";
import path from "path";
import fs from "fs";

type RestartUrgency = "emergency" | "high" | "normal" | "low";

function actorRole(req: Request): string {
  const raw = req.auth?.raw || {};
  const role =
    (raw.role as string | undefined) ||
    (raw.user_role as string | undefined) ||
    (Array.isArray(raw.roles) && raw.roles.length > 0 ? String(raw.roles[0]) : undefined) ||
    "";
  return String(role || "").toLowerCase();
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
    if (hasRole(req, roles) || hasScope(req, "admin:*")) return next();
    return res.status(403).json({
      error: "Forbidden",
      missingRole: roles,
      actorRole: actorRole(req) || "unknown",
    });
  };
}

function readDashboardSummary() {
  const state = readState();
  const defaults = {
    users: [
      { id: "u1", name: "Joseph Were", email: "founder@neuroedge.ai", role: "founder", status: "verified" },
      { id: "u2", name: "Guest User", email: "guest@local", role: "user", status: "active" },
      { id: "u3", name: "Ops Moderator", email: "ops@neuroedge.ai", role: "moderator", status: "active" },
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
    webhooks: [],
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

  /* ---------------- REST API ---------------- */
  const app = express();
  app.use((_req: Request, res: Response, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, X-Org-Id, X-Workspace-Id"
    );
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: process.env.MAX_JSON_BODY || "1mb" }));
  app.use(metricsMiddleware);
  app.use(authMiddleware);
  app.use(doctrineShieldMiddleware);

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

  app.post("/admin/dashboard/users/status", requireWorkspace, requireScope("admin:write"), requireRole(["founder", "admin"]), (req: Request, res: Response) => {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" });
    const { dashboard } = readDashboardSummary();
    const users = Array.isArray(dashboard.users) ? dashboard.users : [];
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
    const suffix = Math.random().toString(36).slice(-4);
    const created = { id: `k-${Date.now()}`, name, keyMasked: `neur...${suffix}`, createdAt: Date.now(), revoked: false };
    const next = [created, ...keys];
    mergeDashboardSection("devApiKeys", next);
    auditDashboardAction(req, "api_keys", "create", { id: created.id });
    res.json({ success: true, devApiKeys: next });
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
    const evt = recordTrainingSample({
      query,
      response: responseText,
      rating,
      orgId: req.auth?.orgId,
      workspaceId: req.auth?.workspaceId,
      actor: req.auth?.sub,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      citations: Array.isArray(req.body?.citations) ? req.body.citations : [],
    });
    res.json({ success: true, event: evt });
  });

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

  app.post("/chat", requireWorkspace, requireScope("chat:write"), aiLimiter, handleChat);
  app.post("/execute", requireWorkspace, requireScope("execute:run"), executeLimiter, handleExecution);
  app.post("/ai", requireWorkspace, requireScope("ai:infer"), aiLimiter, handleAIInference);
  app.post("/ai/stream", requireWorkspace, requireScope("ai:infer"), aiLimiter, async (req: Request, res: Response) => {
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
