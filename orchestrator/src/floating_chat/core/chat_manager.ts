// floating_chat/core/chat_manager.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { PermissionsAgent } from "@floating_chart/core/permissions_agent";

export class FloatingChatManager {
  private eventBus: EventBus;
  private logger: Logger;
  private permissions: PermissionsAgent;

  constructor(eventBus: EventBus, logger: Logger, permissions: PermissionsAgent) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.permissions = permissions;
  }

  startSession(userId: string) {
    this.logger.info("FloatingChat", `Starting session for ${userId}`);
  }

  async handleInput(userId: string, input: string) {
    // Ask Kernel for task analysis
    const canRun = this.permissions.check(userId, input);
    if (!canRun) {
      this.logger.warn("FloatingChat", `Input blocked: ${input}`);
      return;
    }

    this.eventBus.emit("floating_chat:input", { userId, input });
  }
}
