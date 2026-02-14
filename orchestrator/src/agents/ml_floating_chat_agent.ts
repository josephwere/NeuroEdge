// orchestrator/agents/ml_floating_chat_agent.ts
import axios from "axios";
import { OrchestratorAgent } from "@core/agent_manager";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { DevExecutionAgent } from "@agents/dev_execution_agent";

export class MLFloatingChatAgent implements OrchestratorAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private executor: DevExecutionAgent;
  private mlServerUrl: string;

  constructor(eventBus: EventBus, logger: Logger, executor: DevExecutionAgent, mlServerUrl: string) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.executor = executor;
    this.mlServerUrl = mlServerUrl;
    this.start();
  }

  name(): string { return "MLFloatingChatAgent"; }

  start(): void {
    this.logger.info(this.name(), "Started ML Floating Chat Agent");
    this.eventBus.subscribe("floating_chat:analyze", async (input: string) => {
      await this.handleInput(input);
    });
  }

  private async handleInput(input: string) {
    try {
      const response = await axios.post(`${this.mlServerUrl}/predict`, { text: input });
      const recommendedCommand = response.data.action;
      this.logger.info(this.name(), `ML recommends: ${recommendedCommand}`);

      // Emit recommendation for Floating Chat UI
      this.eventBus.emit("floating_chat:recommendation", recommendedCommand);

      // Execute if approved
      await this.executor.handleExecution({ id: Date.now().toString(), command: recommendedCommand });
    } catch (err) {
      this.logger.error(this.name(), `ML prediction failed: ${err}`);
    }
  }
}
