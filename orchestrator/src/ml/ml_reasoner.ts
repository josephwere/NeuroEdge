import { EventBus } from "@core/event_bus";

export interface MLProposal {
  id: string;
  command: string;
  reason: string; // Why ML thinks it should run
}

export class MLReasoner {
  constructor(private eventBus: EventBus) {}

  proposeCommand(command: string): MLProposal {
    const lower = String(command || "").toLowerCase();
    let reason = "Command classified as general execution request.";
    if (lower.includes("test")) reason = "Detected testing workflow. Prefer running tests with verbose output.";
    else if (lower.includes("build") || lower.includes("compile")) reason = "Detected build workflow. Suggest build checks and dependency validation.";
    else if (lower.includes("error") || lower.includes("fail")) reason = "Detected failure analysis workflow. Suggest log analysis before execution.";
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, command, reason };
  }

  startListening() {
    // Listen for user command requests
    this.eventBus.subscribe("dev:user_request", (cmd: string) => {
      const proposal = this.proposeCommand(cmd);
      this.eventBus.emit("ml:proposal", proposal);
    });
  }
}
