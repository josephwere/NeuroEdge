import { EventBus } from "@core/event_bus";
import { MLIntentProposal } from "@ml/intent_proposal";

export class MLExecutionLoop {
  private ml: MLIntentProposal;

  constructor(private bus: EventBus) {
    this.ml = new MLIntentProposal();
    this.init();
  }

  private init() {
    this.bus.subscribe("dev:request", (cmd: { command: string; args?: string[] }) => {
      const intent = this.ml.propose(cmd.command, cmd.args);
      this.bus.emit("intent:proposed", intent);
    });
  }
}
