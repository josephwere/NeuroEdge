// floating_chat/core/permissions_agent.ts
export class PermissionsAgent {
  private approvedUsers: Set<string> = new Set();

  approveUser(userId: string) {
    this.approvedUsers.add(userId);
  }

  check(userId: string, input: string) {
    // Placeholder logic: check command safety, approval, ML flags
    return this.approvedUsers.has(userId);
  }
}
