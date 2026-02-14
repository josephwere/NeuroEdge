import { EventBus } from "@core/event_bus";

export class DevBuilderAgent {
  constructor(private bus: EventBus) {}

  start() {
    this.bus.subscribe("dev:build_request", (req: any) => {
      this.bus.emit("ml:reason", {
        goal: req.goal,
        stack: req.stack,
        output: ["code", "tests", "docs"]
      });
    });
  }
}
