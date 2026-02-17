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
    const service = String(req.body?.service || "").trim().toLowerCase();
    const confirm = Boolean(req.body?.confirm);
    const allowed = ["kernel", "ml", "orchestrator", "frontend"];
    if (!allowed.includes(service)) {
      return res.status(400).json({ error: "Invalid service", allowed });
    }
    appendEvent({
      type: "admin.restart.requested",
      timestamp: Date.now(),
      payload: {
        service,
        actor: req.auth?.sub || "unknown",
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        confirm,
      },
    });
    return res.json({
      success: true,
      executed: false,
      confirmationRequired: true,
      message:
        "Restart is intentionally manual in production-safe mode. Use your process manager (systemd/pm2/k8s) with explicit operator approval.",
      suggestedCommands: [
        `systemctl restart neuroedge-${service}`,
        `pm2 restart neuroedge-${service}`,
      ],
    });
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
