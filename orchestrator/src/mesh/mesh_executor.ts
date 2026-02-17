// mesh/mesh_executor.ts
import { NodeManager, MeshNode } from "@mesh/node_manager";
import { SecureChannel } from "@mesh/secure_channel";
import { Logger } from "@utils/logger";
import { EventBus } from "@core/event_bus";
import axios from "axios";

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
    const decrypted = this.channel.decrypt(payload);
    const parsed = JSON.parse(decrypted);
    try {
      const resp = await axios.post(`${node.address.replace(/\/$/, "")}/execute`, {
        command: parsed.command,
        context: parsed.context || "",
      }, { timeout: 10000 });
      this.eventBus.emit("mesh:result", {
        nodeId: node.id,
        output: resp.data?.stdout || resp.data?.response || JSON.stringify(resp.data || {}),
        success: resp.data?.success !== false,
      });
    } catch (err: any) {
      this.eventBus.emit("mesh:result", {
        nodeId: node.id,
        output: err?.message || "remote execution failed",
        success: false,
      });
    }
  }

  async broadcastCommand(command: string, context?: string) {
    const onlineNodes = this.nodes.getOnlineNodes();
    this.logger.info("MeshExecutor", `Broadcasting command to ${onlineNodes.length} nodes`);

    for (const node of onlineNodes) {
      await this.executeOnNode(node, command, context);
    }
  }
}
