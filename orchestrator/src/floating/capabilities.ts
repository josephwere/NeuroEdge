export type Capability =
  | "exec.local"
  | "exec.mesh"
  | "git.write"
  | "git.force"
  | "fs.write"
  | "network";

export interface CapabilityGrant {
  capability: Capability;
  approved: boolean;
  expiresAt?: number;
}
