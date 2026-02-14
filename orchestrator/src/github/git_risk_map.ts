import { GitRiskLevel } from "@github/git_risk";

export const GIT_RISK_MAP: Record<string, GitRiskLevel> = {
  "git.status": "low",
  "git.diff": "low",
  "git.fetch": "low",

  "git.pull": "medium",
  "git.merge": "medium",
  "git.rebase": "high",

  "git.push": "medium",
  "git.forcePush": "critical",

  "git.checkout": "low",
  "git.createBranch": "low",

  "git.clone": "low",
  "git.init": "low"
};
