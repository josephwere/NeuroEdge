// floating_chat/floating_chat_agent.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { PermissionManager } from "@utils/permissions";
import { MLBridge } from "@utils/ml_bridge";

// Persona Agents
import { ContentCreatorAgent } from "@personas/content_creator_agent";
import { StudentAgent } from "@personas/student_agent";
import { ResearcherAgent } from "@personas/researcher_agent";

export class FloatingChatAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private permissions: PermissionManager;
  private ml: MLBridge;

  private contentAgent: ContentCreatorAgent;
  private studentAgent: StudentAgent;
  private researcherAgent: ResearcherAgent;

  constructor(eventBus: EventBus, logger: Logger, permissions: PermissionManager, ml: MLBridge) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.permissions = permissions;
    this.ml = ml;

    // Initialize persona agents
    this.contentAgent = new ContentCreatorAgent(this.eventBus, this.logger);
    this.studentAgent = new StudentAgent(this.eventBus, this.logger);
    this.researcherAgent = new ResearcherAgent(this.eventBus, this.logger);
  }

  start() {
    this.logger.info("FloatingChatAgent", "Starting Floating Chat and persona agents...");

    // Start persona agents
    this.contentAgent.start();
    this.studentAgent.start();
    this.researcherAgent.start();

    // Subscribe to ML-driven execution requests
    this.eventBus.subscribe("floating_chat:execute", async (payload: any) => {
      await this.handleExecution(payload);
    });

    this.logger.info("FloatingChatAgent", "Floating Chat started successfully");
  }

  private async handleExecution(payload: { command: string; context: string }) {
    this.logger.info("FloatingChatAgent", `Received command: ${payload.command}`);

    // ML proposes next steps
    const proposed = await this.ml.proposeCommand(payload.command, payload.context);
    this.logger.info("FloatingChatAgent", `ML proposed: ${proposed}`);

    // Permission check
    if (!this.permissions.requestApproval({ command: proposed })) {
      this.logger.warn("FloatingChatAgent", "Command blocked pending approval");
      return;
    }

    // Execute on local device or mesh nodes
    this.eventBus.emit("dev:execute", { command: proposed, context: payload.context });
  }
}
