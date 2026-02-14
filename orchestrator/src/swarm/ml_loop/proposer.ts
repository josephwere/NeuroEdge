import { EventBus } from "@core/event_bus";

export class SwarmProposer {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  propose(agentId: string, improvement: any) {
    const proposal = {
      id: `${agentId}_${Date.now()}`,
      agentId,
      improvement,
      mlConfidence: Math.random(), // placeholder ML score
      timestamp: Date.now()
    };

    this.eventBus.emit("agent:propose_improvement", proposal);
  }
}
