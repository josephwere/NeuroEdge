// orchestrator/agents/build_analyzer_agent.ts
import { OrchestratorAgent } from "@core/agent_manager";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { DevExecutionAgent } from "@dev_execution_agent";

export class BuildAnalyzerAgent implements OrchestratorAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private executor: DevExecutionAgent;

  constructor(eventBus: EventBus, logger: Logger, executor: DevExecutionAgent) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.executor = executor;
    this.start();
  }

  name(): string {
    return "BuildAnalyzerAgent";
  }

  start(): void {
    this.logger.info(this.name(), "Started build & log analyzer");
    this.eventBus.subscribe("build:logs", (logs: string) => {
      this.analyzeLogs(logs);
    });
  }

  private analyzeLogs(logs: string) {
    this.logger.info(this.name(), "Analyzing build logs...");
    // Example detection rules (can expand)
    if (/error/i.test(logs)) {
      this.logger.warn(this.name(), "Error detected in logs");
      this.suggestFix(logs);
    }
  }

  private async suggestFix(logs: string) {
    // Minimal example, can integrate ML later
    let command = "";
    if (/missing module/i.test(logs)) {
      command = "npm install";
    } else if (/database connection failed/i.test(logs)) {
      command = "systemctl restart database";
    } else {
      command = "echo 'manual check required'";
    }

    this.logger.info(this.name(), `Suggested fix: ${command}`);
    await this.executor.handleExecution({ id: Date.now().toString(), command });
  }
}
