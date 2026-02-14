import { eventBus } from "@core/event_bus";

export interface MLProposal {
  id: string;
  command: string;
  reason: string; // Why ML thinks it should run
}

// Simulated ML reasoning engine
export class MLReasoner {
  constructor() {}

  proposeCommand(command: string): MLProposal {
    // Placeholder: real ML would analyze context, previous logs, errors
    const reason = `ML predicts this command will fix build or code issues`;
    return { id: Date.now().toString(), command, reason };
  }

  startListening() {
    // Listen for user command requests
    eventBus.subscribe("dev:user_request", (cmd: string) => {
      const proposal = this.proposeCommand(cmd);
      eventBus.emit("ml:proposal", proposal);
    });
  }
}
