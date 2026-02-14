// orchestrator/agents/floating_chat_agent.ts

import { OrchestratorAgent } from "@core/agent_manager";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { MeshManager } from "@mesh/mesh_manager";
import { MLOrchestrator } from "@ml/ml_orchestrator";
import { ExecutionRequest, ExecutionResult } from "@types/execution";

export class FloatingChatAgent implements OrchestratorAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private mesh: MeshManager;
  private ml: MLOrchestrator;

  constructor(
    eventBus: EventBus,
    logger: Logger,
    mesh: MeshManager,
    ml: MLOrchestrator
  ) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.mesh = mesh;
    this.ml = ml;
  }

  name(): string {
    return "FloatingChatAgent";
  }

  start(): void {
    this.logger.info(this.name(), "Floating Chat started");

    // Local execution request
    this.eventBus.subscribe(
      "dev:execute",
      async (req: ExecutionRequest) => {
        await this.handleExecution(req, false);
      }
    );

    // Remote execution request
    this.eventBus.subscribe(
      "dev:execute_remote",
      async (req: ExecutionRequest & { nodeId: string }) => {
        await this.handleExecution(req, true);
      }
    );
  }

  private async handleExecution(req: ExecutionRequest, remote: boolean) {
    // 1️⃣ ML proposes plan
    const mlPlan = await this.ml.suggestCommand(req.command, req.args);
    this.logger.info(this.name(), `ML suggests: ${mlPlan}`);

    // 2️⃣ Kernel validates intent
    const approved = await this.approveExecution(req, mlPlan);
    if (!approved) {
      this.logger.warn(this.name(), `Execution blocked: ${req.command}`);
      return;
    }

    // 3️⃣ Dispatch command
    let result: ExecutionResult;
    if (remote) {
      result = await this.mesh.dispatchCommand(req.nodeId, req.command, req.args);
    } else {
      this.logger.info(this.name(), `Executing locally: ${req.command}`);
      // Local execution logic (reuse DevExecutionAgent)
      this.eventBus.emit("dev:execute", req);
      return;
    }

    // 4️⃣ Stream result back to user interface
    this.logger.info(this.name(), `Execution result: ${JSON.stringify(result)}`);
    this.eventBus.emit("floating_chat:execution_result", result);

    // 5️⃣ Auto-fix suggestions if failed
    if (!result.success) {
      const fixPlan = await this.ml.suggestFix(req.command, result.stderr);
      this.logger.info(this.name(), `ML suggests fix: ${fixPlan}`);
      this.eventBus.emit("floating_chat:fix_suggestion", { req, fixPlan });
    }
  }

  private async approveExecution(req: ExecutionRequest, mlPlan: string): Promise<boolean> {
    // Simple approval logic: integrate UI or automated policy here
    this.logger.info(this.name(), `Approval requested for: ${req.command}`);
    // Auto-approve for now
    return true;
  }
      }
