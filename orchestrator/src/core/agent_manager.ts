import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export interface OrchestratorAgent {
  name(): string;
  start(): void;
}

export class AgentManager {
  private agents: Map<string, OrchestratorAgent>;
  private eventBus: EventBus;
  private logger: Logger;

  constructor(eventBus: EventBus, logger: Logger) {
    this.agents = new Map();
    this.eventBus = eventBus;
    this.logger = logger;
  }

  register(agent: OrchestratorAgent) {
    this.agents.set(agent.name(), agent);
    this.logger.info("AGENT_MANAGER", `Registered agent: ${agent.name()}`);
  }

  start() {
    this.logger.info(
      "AGENT_MANAGER",
      `Starting ${this.agents.size} orchestrator agents`
    );
    for (const agent of this.agents.values()) {
      agent.start();
    }
  }
}
