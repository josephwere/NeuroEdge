// mesh/mesh_executor.ts
import { NodeManager, MeshNode } from "@mesh/node_manager";
import { SecureChannel } from "@mesh/secure_channel";
import { Logger } from "@utils/logger";
import { EventBus } from "@core/event_bus";

export class MeshExecutor {
  private nodes: NodeManager;
  private channel: SecureChannel;
  private logger: Logger;
  private eventBus: EventBus;

  constructor(nodes: NodeManager, channel: SecureChannel, logger: Logger, eventBus: EventBus) {
    this.nodes = nodes;
    this.channel = channel;
    this.logger = logger;
    this.eventBus = eventBus;
  }

  async executeOnNode(node: MeshNode, command: string, context?: string) {
    this.logger.info("MeshExecutor", `Sending command to node ${node.id}`);

    const payload = this.channel.encrypt(JSON.stringify({ command, context }));

    // Simulate sending over network (replace with real transport e.g., WebSocket)
    setTimeout(() => {
      const decrypted = this.channel.decrypt(payload);
      const parsed = JSON.parse(decrypted);
      this.logger.info("MeshExecutor", `Node ${node.id} received: ${parsed.command}`);
      // Emit back result
      this.eventBus.emit("mesh:result", { nodeId: node.id, output: `Executed: ${parsed.command}` });
    }, 500);
  }

  async broadcastCommand(command: string, context?: string) {
    const onlineNodes = this.nodes.getOnlineNodes();
    this.logger.info("MeshExecutor", `Broadcasting command to ${onlineNodes.length} nodes`);

    for (const node of onlineNodes) {
      await this.executeOnNode(node, command, context);
    }
  }
}
