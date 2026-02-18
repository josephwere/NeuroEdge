export type NodeKind = "laptop" | "desktop" | "mobile" | "server" | "unknown";

export interface InferenceNode {
  id: string;
  baseUrl: string;
  kind: NodeKind;
  capabilities: string[];
  lastSeen: number;
  online: boolean;
  consentCompute?: boolean;
  consentTraining?: boolean;
  discoveryEnabled?: boolean;
  lowPowerMode?: boolean;
  lastLatencyMs?: number;
  load?: number;
  cacheSize?: number;
}

export class InferenceRegistry {
  private nodes = new Map<string, InferenceNode>();
  private rrIndex = 0;

  register(node: Omit<InferenceNode, "lastSeen" | "online">) {
    const existing = this.nodes.get(node.id);
    const next: InferenceNode = {
      ...node,
      lastSeen: Date.now(),
      online: true,
      capabilities: node.capabilities || [],
      kind: node.kind || "unknown",
      consentCompute: Boolean(node.consentCompute),
      consentTraining: Boolean(node.consentTraining),
      discoveryEnabled: Boolean(node.discoveryEnabled ?? true),
      lowPowerMode: Boolean(node.lowPowerMode ?? true),
    };
    if (existing) {
      this.nodes.set(node.id, { ...existing, ...next });
      return;
    }
    this.nodes.set(node.id, next);
  }

  heartbeat(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.lastSeen = Date.now();
    node.online = true;
    this.nodes.set(id, node);
  }

  markOfflineIfStale(staleMs = 30000) {
    const now = Date.now();
    for (const [id, node] of this.nodes.entries()) {
      if (now - node.lastSeen > staleMs) {
        node.online = false;
        this.nodes.set(id, node);
      }
    }
  }

  list() {
    this.markOfflineIfStale();
    return Array.from(this.nodes.values());
  }

  get(id: string): InferenceNode | null {
    return this.nodes.get(id) || null;
  }

  updateMetrics(id: string, metrics: { latencyMs?: number; load?: number; cacheSize?: number }) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.lastLatencyMs = metrics.latencyMs ?? node.lastLatencyMs;
    node.load = metrics.load ?? node.load;
    node.cacheSize = metrics.cacheSize ?? node.cacheSize;
    node.lastSeen = Date.now();
    node.online = true;
    this.nodes.set(id, node);
  }

  pickNode(): InferenceNode | null {
    this.markOfflineIfStale();
    const online = this.list().filter((n) => n.online);
    if (online.length === 0) return null;
    const scored = online.map((n) => ({
      node: n,
      score:
        (n.lastLatencyMs ?? 500) +
        (n.load ?? 0) * 100 +
        (n.cacheSize ?? 0) * 0.1,
    }));
    scored.sort((a, b) => a.score - b.score);
    const node = scored[this.rrIndex % scored.length].node;
    this.rrIndex += 1;
    return node;
  }

  pickNodeWhere(filter: (node: InferenceNode) => boolean): InferenceNode | null {
    this.markOfflineIfStale();
    const online = this.list().filter((n) => n.online && filter(n));
    if (online.length === 0) return null;
    const scored = online.map((n) => ({
      node: n,
      score:
        (n.lastLatencyMs ?? 500) +
        (n.load ?? 0) * 100 +
        (n.cacheSize ?? 0) * 0.1,
    }));
    scored.sort((a, b) => a.score - b.score);
    const node = scored[this.rrIndex % scored.length].node;
    this.rrIndex += 1;
    return node;
  }
}
