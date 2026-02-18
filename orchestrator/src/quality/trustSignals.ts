import { listEvents } from "@storage/hybrid_db";

export interface TrustSignalsSummary {
  windowHours: number;
  aiResponses: number;
  policyBlocks: number;
  feedbackUpRate: number;
  feedbackDownRate: number;
  citationCoverageRate: number;
  avgConfidence: number;
  hallucinationRiskScore: number;
}

export function buildTrustSignalsSummary(windowHours = 72): TrustSignalsSummary {
  const cutoff = Date.now() - Math.max(1, windowHours) * 3600 * 1000;
  const events = listEvents(9000).filter((e) => Number(e.timestamp || 0) >= cutoff);

  const aiResponses = events.filter((e) => e.type === "ai.response");
  const policyBlocks = events.filter((e) => e.type === "policy.blocked_ai").length;
  const feedback = events.filter((e) => e.type === "training.sample");

  const up = feedback.filter((e) => String((e.payload || {}).rating || "") === "up").length;
  const down = feedback.filter((e) => String((e.payload || {}).rating || "") === "down").length;

  const responsesWithCitations = aiResponses.filter((e) => Number((e.payload || {}).citationCount || 0) > 0).length;

  const avgConfidence =
    aiResponses.length === 0
      ? 0
      : Number(
          (
            aiResponses.reduce((acc, e) => acc + Number((e.payload || {}).confidence || 0), 0) /
            aiResponses.length
          ).toFixed(4)
        );

  const feedbackTotal = feedback.length;
  const feedbackUpRate = feedbackTotal === 0 ? 0 : Number((up / feedbackTotal).toFixed(4));
  const feedbackDownRate = feedbackTotal === 0 ? 0 : Number((down / feedbackTotal).toFixed(4));
  const citationCoverageRate =
    aiResponses.length === 0 ? 0 : Number((responsesWithCitations / aiResponses.length).toFixed(4));

  const lowConfidencePenalty = avgConfidence < 0.6 ? (0.6 - avgConfidence) * 0.6 : 0;
  const negativeFeedbackPenalty = feedbackDownRate * 0.7;
  const citationPenalty = (1 - citationCoverageRate) * 0.4;
  const blockPenalty = aiResponses.length === 0 ? 0 : Math.min(0.2, policyBlocks / Math.max(1, aiResponses.length));
  const hallucinationRiskScore = Number(
    Math.max(0, Math.min(1, lowConfidencePenalty + negativeFeedbackPenalty + citationPenalty + blockPenalty)).toFixed(4)
  );

  return {
    windowHours,
    aiResponses: aiResponses.length,
    policyBlocks,
    feedbackUpRate,
    feedbackDownRate,
    citationCoverageRate,
    avgConfidence,
    hallucinationRiskScore,
  };
}
