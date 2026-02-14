import { OrchestratorAgent } from "@types";
import { EventBus } from "@core/event_bus";
import { Logger } from "@core/logger";
import { DevExecutionAgent } from "@agents/dev_execution_agent";

interface ExecutionRequest {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  nodeId?: string; // Optional: remote node
}

export class MeshExecutionAgent implements OrchestratorAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private localExecutor: DevExecutionAgent;
  private remoteNodes: Map<string, any>; // placeholder for remote nodes

  constructor(eventBus: EventBus, logger: Logger, localExecutor: DevExecutionAgent) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.localExecutor = localExecutor;
    this.remoteNodes = new Map();
  }

  name(): string {
    return "MeshExecutionAgent";
  }

  start(): void {
    this.logger.info(this.name(), "Started");

    // Listen for execution requests (local or remote)
    this.eventBus.subscribe("floating_chat:execution_request", async (req: ExecutionRequest) => {
      await this.handleExecution(req);
    });
  }

  private async handleExecution(req: ExecutionRequest) {
    if (!req.nodeId || req.nodeId === "local") {
      // Local execution
      this.logger.info(this.name(), `Executing locally: ${req.command}`);
      await this.localExecutor.handleExecution(req);
    } else {
      // Remote execution via mesh
      const node = this.remoteNodes.get(req.nodeId);
      if (!node) {
        this.logger.warn(this.name(), `Node ${req.nodeId} unavailable, executing locally instead`);
        await this.localExecutor.handleExecution(req);
        return;
      }
      this.logger.info(this.name(), `Sending command to node ${req.nodeId}: ${req.command}`);
      node.execute(req); // assume remote node exposes execute API
    }
  }

  // Add/remove remote nodes dynamically
  addNode(nodeId: string, nodeClient: any) {
    this.remoteNodes.set(nodeId, nodeClient);
  }

  removeNode(nodeId: string) {
    this.remoteNodes.delete(nodeId);
  }
  }
