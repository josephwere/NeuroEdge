import { GitIntent } from "@github/git_risk";
import { PermissionManager } from "@utils/permissions";

export function requireGitApproval(
  intent: GitIntent,
  permissions: PermissionManager
): boolean {

  if (intent.risk === "low") return true;

  return permissions.requestApproval({
    action: intent.action,
    risk: intent.risk,
    reason: intent.reason,
    explanation: intent.explanation
  });
}
