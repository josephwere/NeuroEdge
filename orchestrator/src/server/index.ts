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
  app.use(express.json());
  app.use(metricsMiddleware);
  app.use(authMiddleware);

  app.get("/metrics", async (_req: Request, res: Response) => {
    res.set("Content-Type", getPrometheusContentType());
    res.send(await renderPrometheusMetrics());
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

  app.post("/chat", requireWorkspace, requireScope("chat:write"), handleChat);
  app.post("/execute", requireWorkspace, requireScope("execute:run"), handleExecution);
  app.post("/ai", requireWorkspace, requireScope("ai:infer"), handleAIInference);

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
