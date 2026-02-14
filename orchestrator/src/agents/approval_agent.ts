import { eventBus } from "@core/event_bus";
import { MLProposal } from "@ml/ml_reasoner";

export class ApprovalAgent {
  constructor() {}

  start() {
    // Listen for ML proposals
    eventBus.subscribe("ml:proposal", async (proposal: MLProposal) => {
      // Ask user for approval via Floating Chat
      eventBus.emit(
        "floating_chat:approval_request",
        `ML suggests: "${proposal.command}" Reason: ${proposal.reason}. Approve?`
      );
    });

    // Listen for user approval responses
    eventBus.subscribe("floating_chat:user_approval", (data: { id: string; approved: boolean }) => {
      if (data.approved) {
        eventBus.emit("dev:execute", { id: data.id, command: data.id });
      } else {
        eventBus.emit("floating_chat:log_stream", `User rejected ML proposal: ${data.id}`);
      }
    });
  }
}
