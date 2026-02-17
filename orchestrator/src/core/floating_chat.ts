import { EventBus } from "@core/event_bus";
import { ExecutionIntent } from "@core/intent";

export class FloatingChat {
  constructor(private bus: EventBus) {}

  init() {
    // Subscribe to new intents
    this.bus.subscribe("intent:proposed", (intent: ExecutionIntent) => {
      console.log(`[FloatingChat] New intent proposed: ${intent.command}`);
      this.showIntent(intent);
    });
  }

  showIntent(intent: ExecutionIntent) {
    this.bus.emit("floating_chat:intent", {
      id: intent.id,
      command: intent.command,
      args: intent.args || [],
      reason: intent.reason,
      riskLevel: intent.riskLevel,
      affectsSystem: intent.affectsSystem,
      options: ["approve", "deny", "edit", "cancel"],
      timestamp: Date.now(),
    });
  }

  approve(intent: ExecutionIntent) {
    this.bus.emit("intent:approved", intent);
  }

  deny(intent: ExecutionIntent, reason: string) {
    this.bus.emit("intent:denied", { intentId: intent.id, reason });
  }

  edit(intent: ExecutionIntent, newCommand: string, newArgs?: string[]) {
    intent.command = newCommand;
    intent.args = newArgs;
    this.bus.emit("intent:edited", intent);
  }

  cancel(intent: ExecutionIntent) {
    this.bus.emit("intent:cancelled", intent);
  }
}
