export interface MeshNodeIdentity {
  nodeId: string;
  publicKey: string;
  trustLevel: "local" | "verified" | "restricted";
}
