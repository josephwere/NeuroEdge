import { MeshNode } from "@mesh/remote_node";

export class MeshRegistry {
  private nodes = new Map<string, MeshNode>();

  register(node: MeshNode) {
    this.nodes.set(node.id, node);
  }

  getAvailable(capability: string): MeshNode[] {
    return Array.from(this.nodes.values()).filter(
      n => n.trusted && n.capabilities.includes(capability)
    );
  }
}
