// orchestrator/agents/mesh_agent.ts

import { OrchestratorAgent } from "@core/agent_manager";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { MeshManager } from "@mesh/mesh_manager";

export class MeshAgent implements OrchestratorAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private mesh: MeshManager;

  constructor(eventBus: EventBus, logger: Logger, mesh: MeshManager) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.mesh = mesh;
  }

  name(): string {
    return "MeshAgent";
  }

  start(): void {
    this.logger.info(this.name(), "Mesh Agent started");

    // Remote execution request from Floating Chat or other agents
    this.eventBus.subscribe("dev:execute_remote", async (payload: any) => {
      const { nodeId, command, args } = payload;
      this.logger.info(this.name(), `Executing on node ${nodeId}: ${command}`);
      const result = await this.mesh.dispatchCommand(nodeId, command, args);

      // Emit back the result to Floating Chat or orchestrator
      this.eventBus.emit("dev:result_remote", { nodeId, result });
    });

    // Auto-discovery or health check broadcast
    this.eventBus.subscribe("mesh:discover", async () => {
      const nodes = this.mesh.discoverNodes();
      this.logger.info(this.name(), `Nodes discovered: ${nodes.map(n => n.id).join(", ")}`);
      this.eventBus.emit("mesh:discovered", nodes);
    });
  }
  }
