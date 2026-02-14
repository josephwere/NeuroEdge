import { GitHubAgent } from "@github/github_agent";
import { buildGitIntent } from "@github/git_intent_builder";
import { requireGitApproval } from "@github/git_approval";
import { PermissionManager } from "@utils/permissions";

export class SafeGitExecutor {

  constructor(
    private git: GitHubAgent,
    private permissions: PermissionManager
  ) {}

  async execute(
    action: keyof GitHubAgent,
    params: any,
    mlReason: string
  ) {
    const intent = buildGitIntent(
      `git.${action}`,
      params,
      mlReason
    );

    if (!requireGitApproval(intent, this.permissions)) {
      throw new Error("Git operation blocked pending approval");
    }

    // @ts-ignore
    return this.git[action](...Object.values(params));
  }
}
