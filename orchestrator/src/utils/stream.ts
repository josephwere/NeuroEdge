import { EventBus } from "@core/event_bus";

export class StreamLogger {
  constructor(private bus: EventBus) {}

  start() {
    this.bus.subscribe("dev:result", (res: any) => {
      console.log(`📡 [Stream] ${res.success ? "Success" : "Fail"} Output:\n${res.stdout}`);
      if (res.stderr) console.error(`⚠️ [Stream Error] ${res.stderr}`);
    });

    this.bus.subscribe("remote:execution:received", (req: any) => {
      console.log(`🌐 [Remote Node] Executing command: ${req.command}`);
    });
  }
}
