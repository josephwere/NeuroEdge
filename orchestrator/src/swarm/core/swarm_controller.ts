import { EventBus } from "@core/event_bus";
import { ImprovementRegistry } from "@swam/core/improvement_registry";
import { AgentEvaluator } from "@swatm/core/agent_evaluator";

export class SwarmController {
  private registry: ImprovementRegistry;
  private evaluator: AgentEvaluator;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.registry = new ImprovementRegistry();
    this.evaluator = new AgentEvaluator();
  }

  start() {
    this.eventBus.subscribe("agent:propose_improvement", async (proposal) => {
      await this.handleProposal(proposal);
    });
  }

  private async handleProposal(proposal: any) {
    const score = this.evaluator.evaluate(proposal);

    if (score >= 0.8) {
      this.registry.register(proposal);
      this.eventBus.emit("agent:approved", proposal);
      console.log(`✅ Proposal approved: ${proposal.id}`);
    } else {
      console.log(`⚠️ Proposal rejected: ${proposal.id} (score: ${score})`);
      this.eventBus.emit("agent:rejected", proposal);
    }
  }
}
