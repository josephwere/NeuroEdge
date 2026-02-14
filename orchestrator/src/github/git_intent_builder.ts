import { GitIntent } from "@github/git_risk";
import { GIT_RISK_MAP } from "@github/git_risk_map";

export function buildGitIntent(
  action: string,
  params: any,
  mlReason: string
): GitIntent {

  const risk = GIT_RISK_MAP[action] || "medium";

  let explanation = "";

  switch (action) {
    case "git.forcePush":
      explanation =
        "This will rewrite remote history. Other collaborators may lose commits.";
      break;

    case "git.rebase":
      explanation =
        "This will rewrite local commit history to appear linear.";
      break;

    case "git.merge":
      explanation =
        "This will combine histories and may create a merge commit.";
      break;

    case "git.pull":
      explanation =
        "This will fetch and integrate remote changes.";
      break;

    default:
      explanation = "This is a standard git operation.";
  }

  return {
    action,
    target: params?.target,
    branch: params?.branch,
    reason: mlReason,
    risk,
    explanation
  };
}
