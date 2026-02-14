import { GitIntent } from "@github/git_risk";

export function renderIntent(intent: GitIntent) {
  return {
    title: `Git Action: ${intent.action}`,
    risk: intent.risk.toUpperCase(),
    explanation: intent.explanation,
    reason: intent.reason
  };
}
