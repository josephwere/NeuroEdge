import WebSocket from "ws";
import { Logger } from "@utils/logger";
import { EventBus } from "@core/event_bus";

export interface Node {
  id: string;
  address: string; // ws://node-address:port
  online?: boolean;
  load?: number;
  latencyMs?: number;
  lastSeenAt?: number;
}

export class MeshManager {
  private nodes: Node[];
  private logger: Logger;
  private eventBus: EventBus;
  private rrIndex = 0;

  constructor(nodes: Node[], logger: Logger, eventBus: EventBus) {
    this.nodes = nodes;
    this.logger = logger;
    this.eventBus = eventBus;

    this.eventBus.subscribe("mesh:execute", async (payload) => {
      await this.executeOnNode(payload.command, payload.nodeId);
    });
  }

  private pickNode(nodeId?: string): Node | null {
    const onlineNodes = this.nodes.filter((n) => n.online !== false);
    if (nodeId) {
      return onlineNodes.find((n) => n.id === nodeId) || null;
    }
    if (onlineNodes.length === 0) return null;
    if (onlineNodes.length === 1) return onlineNodes[0];

    const ranked = [...onlineNodes].sort((a, b) => {
      const loadA = Number(a.load || 0);
      const loadB = Number(b.load || 0);
      if (loadA !== loadB) return loadA - loadB;
      const latA = Number(a.latencyMs || 0);
      const latB = Number(b.latencyMs || 0);
      if (latA !== latB) return latA - latB;
      return Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0);
    });

    const lowestLoad = Number(ranked[0].load || 0);
    const lowestLatency = Number(ranked[0].latencyMs || 0);
    const pool = ranked.filter(
      (n) => Number(n.load || 0) === lowestLoad && Number(n.latencyMs || 0) === lowestLatency
    );
    const idx = this.rrIndex % pool.length;
    this.rrIndex += 1;
    return pool[idx];
  }

  private async executeOnNode(command: string, nodeId?: string) {
    const target = this.pickNode(nodeId);

    if (!target) {
      this.logger.error("MeshManager", "No node available for execution");
      this.eventBus.emit("mesh:result", {
        success: false,
        output: "No node available for execution",
      });
      return;
    }

    this.logger.info("MeshManager", `Sending command to node ${target.id}: ${command}`);
    const timeoutMs = Math.max(1000, Number(process.env.MESH_WS_TIMEOUT_MS || 10000));

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(target.address);
      let settled = false;
      const settle = (finalEvent?: Record<string, any>) => {
        if (settled) return;
        settled = true;
        if (finalEvent) this.eventBus.emit("mesh:result", finalEvent);
        resolve();
      };

      const timer = setTimeout(() => {
        this.logger.error("MeshManager", `Node ${target.id} timeout after ${timeoutMs}ms`);
        try {
          ws.close();
        } catch {
          // no-op
        }
        settle({ nodeId: target.id, success: false, output: "mesh websocket timeout" });
      }, timeoutMs);

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "mesh:execute", command }));
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "mesh:result") {
            clearTimeout(timer);
            target.lastSeenAt = Date.now();
            if (typeof msg.load === "number") target.load = msg.load;
            if (typeof msg.latencyMs === "number") target.latencyMs = msg.latencyMs;

            this.logger.info("MeshManager", `Node ${target.id} result: ${msg.stdout || msg.output || ""}`);
            this.eventBus.emit("floating:log", msg);
            settle({
              nodeId: target.id,
              success: msg.success !== false,
              output: msg.stdout || msg.output || "",
            });
            try {
              ws.close();
            } catch {
              // no-op
            }
          }
        } catch (err: any) {
          clearTimeout(timer);
          this.logger.error("MeshManager", `Node ${target.id} parse error: ${err?.message || String(err)}`);
          settle({
            nodeId: target.id,
            success: false,
            output: "invalid mesh response payload",
          });
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        this.logger.error("MeshManager", `Node ${target.id} error: ${err}`);
        settle({ nodeId: target.id, success: false, output: String(err) });
      });

      ws.on("close", () => {
        clearTimeout(timer);
        settle();
      });
    });
  }
}
