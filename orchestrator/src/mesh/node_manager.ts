// mesh/node_manager.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export interface MeshNode {
  id: string;
  address: string;
  online: boolean;
  load?: number;
  latencyMs?: number;
  lastSeenAt?: number;
}

export class NodeManager {
  private nodes: Map<string, MeshNode> = new Map();
  private logger: Logger;
  private eventBus: EventBus;
  private rrIndex = 0;

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
  }

  registerNode(node: MeshNode) {
    const normalized: MeshNode = {
      id: node.id,
      address: node.address,
      online: node.online !== false,
      load: Number.isFinite(node.load as number) ? Number(node.load) : 0,
      latencyMs: Number.isFinite(node.latencyMs as number) ? Number(node.latencyMs) : 0,
      lastSeenAt: Date.now(),
    };
    this.nodes.set(node.id, normalized);
    this.logger.info("NodeManager", `Node registered: ${node.id} @ ${node.address}`);
    this.eventBus.emit("mesh:node_registered", normalized);
  }

  getOnlineNodes(): MeshNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.online);
  }

  getBestNode(preferredId?: string): MeshNode | null {
    const onlineNodes = this.getOnlineNodes();
    if (preferredId) {
      const preferred = onlineNodes.find((n) => n.id === preferredId);
      if (preferred) return preferred;
    }
    if (onlineNodes.length === 0) return null;

    const scored = [...onlineNodes].sort((a, b) => {
      const loadA = Number(a.load || 0);
      const loadB = Number(b.load || 0);
      if (loadA !== loadB) return loadA - loadB;
      const latA = Number(a.latencyMs || 0);
      const latB = Number(b.latencyMs || 0);
      if (latA !== latB) return latA - latB;
      const seenA = Number(a.lastSeenAt || 0);
      const seenB = Number(b.lastSeenAt || 0);
      return seenB - seenA;
    });

    const topLoad = Number(scored[0].load || 0);
    const topLatency = Number(scored[0].latencyMs || 0);
    const tied = scored.filter(
      (n) => Number(n.load || 0) === topLoad && Number(n.latencyMs || 0) === topLatency
    );
    if (tied.length === 1) return tied[0];

    const index = this.rrIndex % tied.length;
    this.rrIndex += 1;
    return tied[index];
  }

  markNodeStatus(nodeId: string, online: boolean) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.online = online;
      node.lastSeenAt = Date.now();
      this.logger.info("NodeManager", `Node ${nodeId} is now ${online ? "online" : "offline"}`);
      this.eventBus.emit("mesh:node_status", { nodeId, online });
    }
  }

  updateNodeMetrics(nodeId: string, metrics: { load?: number; latencyMs?: number; online?: boolean }) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (Number.isFinite(metrics.load as number)) node.load = Number(metrics.load);
    if (Number.isFinite(metrics.latencyMs as number)) node.latencyMs = Number(metrics.latencyMs);
    if (typeof metrics.online === "boolean") node.online = metrics.online;
    node.lastSeenAt = Date.now();
  }
}
