import { EventBus } from "@core/event_bus";

export class SwarmProposer {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  private computeConfidence(improvement: any): number {
    const text = JSON.stringify(improvement || {}).toLowerCase();
    if (!text || text === "{}") return 0.25;

    let score = 0.4;
    if (text.includes("benchmark") || text.includes("metrics")) score += 0.18;
    if (text.includes("rollback") || text.includes("fallback")) score += 0.12;
    if (text.includes("test") || text.includes("coverage")) score += 0.12;
    if (text.includes("security") || text.includes("auth")) score += 0.12;
    if (text.length > 500) score += 0.08;
    if (text.includes("todo") || text.includes("placeholder")) score -= 0.2;

    if (score < 0.05) return 0.05;
    if (score > 0.99) return 0.99;
    return Number(score.toFixed(3));
  }

  propose(agentId: string, improvement: any) {
    const confidence = this.computeConfidence(improvement);
    const proposal = {
      id: `${agentId}_${Date.now()}`,
      agentId,
      improvement,
      mlConfidence: confidence,
      timestamp: Date.now()
    };

    this.eventBus.emit("agent:propose_improvement", proposal);
  }
}
