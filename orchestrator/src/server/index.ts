// orchestrator/src/server/index.ts
import express, { Request, Response } from "express";
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
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json());

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

  app.post("/chat", handleChat);
  app.post("/execute", handleExecution);
  app.post("/ai", handleAIInference);
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

  new GitHubAgent(); // placeholder, safe init

  /* ---------------- Kernel ---------------- */
  const kernelUrl = process.env.KERNEL_URL || "http://localhost:8080";
  globalKernelManager.addKernel("local", kernelUrl);
}
