import WebSocket from "ws";
import { Logger } from "@utils/logger";
import { EventBus } from "@core/event_bus";

export interface Node {
  id: string;
  address: string; // ws://node-address:port
}

export class MeshManager {
  private nodes: Node[];
  private logger: Logger;
  private eventBus: EventBus;

  constructor(nodes: Node[], logger: Logger, eventBus: EventBus) {
    this.nodes = nodes;
    this.logger = logger;
    this.eventBus = eventBus;

    this.eventBus.subscribe("mesh:execute", async (payload) => {
      await this.executeOnNode(payload.command, payload.nodeId);
    });
  }

  private async executeOnNode(command: string, nodeId?: string) {
    const target = nodeId
      ? this.nodes.find((n) => n.id === nodeId)
      : this.nodes[Math.floor(Math.random() * this.nodes.length)];

    if (!target) {
      this.logger.error("MeshManager", "No node available for execution");
      return;
    }

    this.logger.info(
      "MeshManager",
      `Sending command to node ${target.id}: ${command}`
    );

    const ws = new WebSocket(target.address);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "mesh:execute", command }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "mesh:result") {
        this.logger.info(
          "MeshManager",
          `Node ${target.id} result: ${msg.stdout}`
        );
        this.eventBus.emit("floating:log", msg); // streaming logs to Floating Chat
      }
    });

    ws.on("error", (err) => {
      this.logger.error("MeshManager", `Node ${target.id} error: ${err}`);
    });
  }
          }
