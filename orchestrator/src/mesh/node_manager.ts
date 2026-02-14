// mesh/node_manager.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export interface MeshNode {
  id: string;
  address: string;
  online: boolean;
}

export class NodeManager {
  private nodes: Map<string, MeshNode> = new Map();
  private logger: Logger;
  private eventBus: EventBus;

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
  }

  registerNode(node: MeshNode) {
    this.nodes.set(node.id, node);
    this.logger.info("NodeManager", `Node registered: ${node.id} @ ${node.address}`);
  }

  getOnlineNodes(): MeshNode[] {
    return Array.from(this.nodes.values()).filter(n => n.online);
  }

  markNodeStatus(nodeId: string, online: boolean) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.online = online;
      this.logger.info("NodeManager", `Node ${nodeId} is now ${online ? "online" : "offline"}`);
    }
  }
        }
