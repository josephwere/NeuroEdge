import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { MLIntegration } from "@ml_integration";
import { MeshManager, Node } from "@mesh/mesh_manager";
import { FloatingChatAgent } from "@agents/floating_chat_agent";

export class Orchestrator {
  public eventBus: EventBus;
  public logger: Logger;
  public ml: MLIntegration;
  public mesh: MeshManager;
  public floatingChat: FloatingChatAgent;

  constructor(nodes: Node[], mlServerUrl: string) {
    this.eventBus = new EventBus();
    this.logger = new Logger("info", "");

    this.ml = new MLIntegration(this.eventBus, mlServerUrl);
    this.mesh = new MeshManager(nodes, this.logger, this.eventBus);
    this.floatingChat = new FloatingChatAgent(this.eventBus, this.ml, this.mesh, this.logger);

    this.logger.info("Orchestrator", "All systems initialized ✅");
  }
}
