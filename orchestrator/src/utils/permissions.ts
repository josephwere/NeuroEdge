import { ExecutionRequest } from "../types/execution";

export class PermissionManager {
  private approvedIds = new Set<string>();

  // Validate if execution is allowed
  validate(req: ExecutionRequest): boolean {
    return this.approvedIds.has(req.id);
  }

  // Approve intent (called by floating chat UI)
  approve(id: string) {
    this.approvedIds.add(id);
    console.log(`✅ Permission granted for execution ID: ${id}`);
  }

  // Optionally revoke
  revoke(id: string) {
    this.approvedIds.delete(id);
    console.log(`⚠️ Permission revoked for execution ID: ${id}`);
  }

  // Request approval hook (could notify UI)
  requestApproval(req: ExecutionRequest): boolean {
    console.log(`📝 Requesting approval for: ${req.command}`);
    return this.validate(req);
  }
}
