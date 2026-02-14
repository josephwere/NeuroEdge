export class AgentEvaluator {
  evaluate(proposal: any): number {
    // Simple heuristic: ML confidence + agent trust score
    const mlScore = proposal.mlConfidence || 0;
    const trustScore = proposal.agentTrust || 0.5;
    return 0.7 * mlScore + 0.3 * trustScore;
  }
}
