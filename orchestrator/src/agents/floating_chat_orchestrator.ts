import { EventBus } from "@core/event_bus";
import { Logger } from "@core/logger";
import { FloatingChatAgent } from "@floating_chat_agent";
import { DevExecutionAgent } from "@dev_execution_agent";
import { MLOrchestrator } from "@ml/ml_integration";
import { MeshExecutionAgent } from "@mesh_execution_agent";

export class FloatingChatOrchestrator {
  constructor(
    eventBus: EventBus,
    logger: Logger
  ) {
    // 1️⃣ Local executor
    const devExecutor = new DevExecutionAgent(eventBus, logger, /* permissions */);

    // 2️⃣ Mesh-aware executor
    const meshExecutor = new MeshExecutionAgent(eventBus, logger, devExecutor);

    // 3️⃣ ML reasoning loop
    const ml = new MLOrchestrator(eventBus, logger);

    // 4️⃣ Floating Chat agent handles ML → approval → execution
    const floatingChatAgent = new FloatingChatAgent(eventBus, logger);

    // Start everything
    devExecutor.start();
    meshExecutor.start();
    floatingChatAgent.start();

    logger.info("FloatingChatOrchestrator", "All floating chat systems running");
  }
}
