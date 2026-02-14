import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export type StreamLogEvent = {
  id: string;           // unique execution ID
  type: "stdout" | "stderr" | "status";
  message: string;      // log message
  timestamp: string;
};

export class StreamLogger {
  private buffers: Map<string, string[]> = new Map();

  constructor(private eventBus: EventBus, private logger: Logger) {}

  // Initialize subscriptions
  start() {
    this.eventBus.subscribe("stream:log", (event: StreamLogEvent) => {
      this.handleEvent(event);
    });
  }

  // Append message to buffer and emit to UI
  private handleEvent(event: StreamLogEvent) {
    if (!this.buffers.has(event.id)) {
      this.buffers.set(event.id, []);
    }

    const buffer = this.buffers.get(event.id)!;
    buffer.push(`[${event.timestamp}] [${event.type}] ${event.message}`);

    // Forward immediately to console
    if (event.type === "stdout") {
      process.stdout.write(event.message + "\n");
    } else if (event.type === "stderr") {
      process.stderr.write(event.message + "\n");
    } else {
      this.logger.info("StreamLogger", event.message);
    }

    // Emit to floating chat UI (frontend listens on this event)
    this.eventBus.emit(`floating:log:${event.id}`, buffer.join("\n"));
  }

  // Helper to push logs programmatically
  log(id: string, type: StreamLogEvent["type"], message: string) {
    const event: StreamLogEvent = {
      id,
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    this.eventBus.emit("stream:log", event);
  }

  // Clear buffer when execution finishes
  clear(id: string) {
    this.buffers.delete(id);
    this.eventBus.emit(`floating:log:${id}`, "✅ Execution complete, logs cleared");
  }

  // Retrieve buffered logs (for late subscribers)
  getBuffer(id: string): string {
    return this.buffers.get(id)?.join("\n") || "";
  }
        }
