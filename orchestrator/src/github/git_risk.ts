export type GitRiskLevel = "low" | "medium" | "high" | "critical";

export interface GitIntent {
  action: string;
  target?: string;
  branch?: string;
  reason: string;
  risk: GitRiskLevel;
  explanation: string;
}
