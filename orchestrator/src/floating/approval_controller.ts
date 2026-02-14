import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class ApprovalController {
  private pending = new Map<string, Function>();

  constructor(
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  requestApproval(
    executionId: string,
    preview: string
  ): Promise<boolean> {
    this.logger.info("Approval", `Requesting approval: ${preview}`);

    this.eventBus.emit("ui:approval:request", {
      executionId,
      preview
    });

    return new Promise(resolve => {
      this.pending.set(executionId, resolve);
    });
  }

  start() {
    this.eventBus.subscribe(
      "ui:approval:decision",
      ({ executionId, approved }) => {
        const resolver = this.pending.get(executionId);
        if (resolver) {
          resolver(approved);
          this.pending.delete(executionId);
        }
      }
    );
  }
      }
