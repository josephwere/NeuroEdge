// orchestrator/ml/ml_agent.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { FloatingChatAgent } from "@agents/floating_chat_agent";

export class MLAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private floatingChat: FloatingChatAgent;

  constructor(eventBus: EventBus, logger: Logger, floatingChat: FloatingChatAgent) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.floatingChat = floatingChat;
    this.startListening();
  }

  private startListening() {
    this.eventBus.subscribe("ml:proposal", async (payload: any) => {
      this.logger.info("MLAgent", `Received ML proposal: ${payload.command}`);
      this.logger.info("MLAgent", `Reason: ${payload.reason}`);

      // Ask user for approval via Floating Chat
      const approved = await this.floatingChat.requestApproval(payload);
      if (approved) {
        this.logger.info("MLAgent", `User approved: executing ${payload.command}`);
        this.floatingChat.handleCommand(payload.command, payload.context);
      } else {
        this.logger.warn("MLAgent", `User rejected ML command: ${payload.command}`);
      }
    });
  }
}
