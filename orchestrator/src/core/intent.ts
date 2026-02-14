export interface ExecutionIntent {
  id: string;
  command: string;
  args?: string[];
  reason: string;
  riskLevel: "low" | "medium" | "high";
  affectsSystem: boolean;
}
