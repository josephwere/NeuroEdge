export type NodeKind = "laptop" | "desktop" | "mobile" | "server" | "unknown";

export interface InferenceNode {
  id: string;
  baseUrl: string;
  kind: NodeKind;
  capabilities: string[];
  lastSeen: number;
  online: boolean;
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

  pickNode(): InferenceNode | null {
    this.markOfflineIfStale();
    const online = this.list().filter((n) => n.online);
    if (online.length === 0) return null;
    const node = online[this.rrIndex % online.length];
    this.rrIndex += 1;
    return node;
  }
}
