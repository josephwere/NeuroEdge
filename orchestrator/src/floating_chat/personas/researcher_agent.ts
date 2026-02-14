// floating_chat/personas/researcher_agent.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class ResearcherAgent {
  constructor(private eventBus: EventBus, private logger: Logger) {}

  name(): string {
    return "ResearcherAgent";
  }

  start() {
    this.logger.info(this.name(), "Started");

    this.eventBus.subscribe("research:data_analysis", async (payload: { dataset: any; task: string }) => {
      await this.handleData(payload.dataset, payload.task);
    });
  }

  private async handleData(dataset: any, task: string) {
    this.logger.info(this.name(), `Performing research task: ${task}`);
    
    // Placeholder: ML-based analysis
    const insights = `Generated insights for task "${task}" on dataset`;

    this.eventBus.emit("research:insights", {
      task,
      insights
    });

    this.logger.info(this.name(), `Research task completed: ${task}`);
  }
}
