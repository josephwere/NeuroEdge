// orchestrator/src/index.ts
import { startServer } from "@server";
import { loadConfig } from "@config/config";
import { EventBus } from "@core/event_bus";
import { AgentManager } from "@core/agent_manager";
import { KernelBridge } from "@bridge/kernel_bridge";
import { MLBridge } from "@bridge/ml_bridge";
import { Logger } from "@utils/logger";

async function boot() {
  console.log("🚀 Starting NeuroEdge Orchestrator v1.0");

  /* ---------------- Config & Logger ---------------- */
  const config = loadConfig();
  const logger = new Logger(config.logLevel);

  /* ---------------- Core Systems ---------------- */
  const eventBus = new EventBus(logger);
  const agentManager = new AgentManager(eventBus, logger);

  /* ---------------- Bridges (Soft Dependencies) ---------------- */
  const kernelBridge = new KernelBridge(
    config.kernelUrl,
    eventBus,
    logger
  );

  const mlBridge = new MLBridge(
    config.mlUrl,
    eventBus,
    logger
  );

  // 🔒 Soft-connect: NEVER crash orchestrator
  kernelBridge.connect().catch(() => {
    logger.warn(
      "SYSTEM",
      "Kernel unavailable — orchestrator running in degraded mode"
    );
  });

  mlBridge.connect().catch(() => {
    logger.warn(
      "SYSTEM",
      "ML system unavailable — orchestrator running in degraded mode"
    );
  });

  /* ---------------- Agents ---------------- */
  agentManager.start();

  /* ---------------- Server ---------------- */
  startServer(config.port, eventBus, logger);

  logger.info("SYSTEM", "NeuroEdge Orchestrator is live 🚀");
}

/* ---------------- Global Safety Net ---------------- */
boot().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});
