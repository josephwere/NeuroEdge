import { EventBus } from "@core/event_bus";
import { Logger } from "@core/logger";

export class MeshExecutor {
  private eventBus: EventBus;
  private logger: Logger;
  private nodes: string[]; // list of connected nodes

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.nodes = [];
  }

  // Discover new nodes in the mesh network
  discoverNodes(nodes: string[]) {
    this.nodes = nodes;
    this.logger.info("MeshExecutor", `Discovered nodes: ${nodes.join(", ")}`);
  }

  // Execute a command on a specific remote node
  async executeRemote(node: string, command: string, args?: string[]) {
    this.logger.info(
      "MeshExecutor",
      `Executing on ${node}: ${command} ${args?.join(" ") || ""}`
    );

    // TODO: replace with real SSH / WebSocket / API call to node
    const result = {
      success: true,
      stdout: "Simulated remote execution completed",
      stderr: "",
    };

    // emit the result event for frontend/logging purposes
    this.eventBus.emit("mesh:execution_result", { node, command, result });

    return result;
  }

  // Broadcast a command to all known nodes
  async broadcast(command: string, args?: string[]) {
    const results = [];
    for (const node of this.nodes) {
      results.push(await this.executeRemote(node, command, args));
    }
    return results;
  }
}
