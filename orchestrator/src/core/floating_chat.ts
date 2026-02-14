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
    // Simulate floating UI (replace with real UI hook)
    console.log(`💬 [Floating Chat] Command: ${intent.command}`);
    console.log(`Reason: ${intent.reason}`);
    console.log(`Risk: ${intent.riskLevel}`);
    console.log(`Affects System: ${intent.affectsSystem}`);
    console.log("Options: [approve] [deny] [edit] [cancel]");
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
