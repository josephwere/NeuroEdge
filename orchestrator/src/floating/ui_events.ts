export type ApprovalRequestEvent = {
  executionId: string;
  preview: string;
};

export type ApprovalDecisionEvent = {
  executionId: string;
  approved: boolean;
};
