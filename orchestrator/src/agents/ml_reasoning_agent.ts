import { orchestratorBus } from "@core/event_bus";

export class MLReasoningAgent {
  constructor() {
    orchestratorBus.onEvent("dev:result", this.analyze.bind(this));
  }

  analyze(result: any) {
    if (!result.success) {
      orchestratorBus.emitEvent("floating_chat:fix_suggestion", {
        id: result.id,
        fixPlan: "Detected build failure. Suggest running dependency reinstall or fixing import paths.",
      });

      orchestratorBus.emitEvent("floating_chat:approval_request", {
        id: result.id,
        message: "Apply suggested fix automatically?",
      });
    } else {
      orchestratorBus.emitEvent("floating_chat:reasoning",
        "Execution succeeded. No anomalies detected."
      );
    }
  }
}
