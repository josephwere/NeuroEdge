export interface MeshNode {
  id: string;
  address: string;
  sendCommand(payload: any): Promise<void>;
}

export class NodeRegistry {
  private nodes: Map<string, MeshNode>;
  private localNodeId: string;

  constructor(localNodeId: string) {
    this.nodes = new Map();
    this.localNodeId = localNodeId;
  }

  registerNode(node: MeshNode) {
    this.nodes.set(node.id, node);
  }

  getNode(nodeId: string): MeshNode {
    return this.nodes.get(nodeId)!;
  }

  isLocal(nodeId: string): boolean {
    return nodeId === this.localNodeId;
  }

  getAllNodes(): MeshNode[] {
    return Array.from(this.nodes.values());
  }
}
