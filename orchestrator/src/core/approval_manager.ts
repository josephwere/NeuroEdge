import { EventBus } from "@core/event_bus";
import { ExecutionIntent } from "@core/intent";
import { KernelCapability } from "@core/capability";

export class ApprovalManager {
  constructor(private bus: EventBus) {
    this.init();
  }

  private init() {
    this.bus.subscribe("intent:approved", (intent: ExecutionIntent) => {
      console.log(`[ApprovalManager] Intent approved: ${intent.command}`);
      const cap: KernelCapability = {
        id: crypto.randomUUID(),
        issuedBy: "kernel",
        subject: "DevExecutionAgent",
        permissions: ["exec:local", "exec:remote"],
        expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour
        signature: "signed-by-kernel"
      };
      this.bus.emit("capability:issued", cap);
      this.bus.emit("execute:approved", intent);
    });

    this.bus.subscribe("intent:denied", ({ intentId, reason }) => {
      console.log(`[ApprovalManager] Intent denied: ${intentId} Reason: ${reason}`);
    });
  }
}
