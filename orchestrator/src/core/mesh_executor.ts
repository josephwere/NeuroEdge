import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import axios from "axios";

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
    const timeoutMs = Math.max(1000, Number(process.env.MESH_EXEC_TIMEOUT_MS || 10000));
    const commandPayload = { command, args: Array.isArray(args) ? args : [] };
    const candidates = [`${node.replace(/\/$/, "")}/execute`, `${node.replace(/\/$/, "")}/infer`];

    let lastError = "remote execution failed";
    for (const url of candidates) {
      try {
        const resp = await axios.post(url, commandPayload, { timeout: timeoutMs });
        const data = resp.data || {};
        const result = {
          success: Boolean(data.success !== false),
          stdout:
            typeof data.stdout === "string"
              ? data.stdout
              : typeof data.response === "string"
                ? data.response
                : typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data),
          stderr: typeof data.stderr === "string" ? data.stderr : "",
          endpoint: url,
        };
        this.eventBus.emit("mesh:execution_result", { node, command, result });
        return result;
      } catch (err: any) {
        lastError = err?.response?.data?.error || err?.message || String(err);
      }
    }

    const failed = {
      success: false,
      stdout: "",
      stderr: lastError,
    };
    this.eventBus.emit("mesh:execution_result", { node, command, result: failed });
    return failed;
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
