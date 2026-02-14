import WebSocket from "ws";
import { EventBus } from "@core/event_bus";

export interface MLProposal {
  command: string;
  reason: string;
  remote?: { node: string };
}

export class MLIntegration {
  private ws: WebSocket;
  private eventBus: EventBus;

  constructor(eventBus: EventBus, mlServerUrl: string) {
    this.eventBus = eventBus;
    this.ws = new WebSocket(mlServerUrl);

    this.ws.on("open", () => {
      console.log("✅ Connected to ML server");
    });

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "proposal") {
        this.eventBus.emit("ml:proposal", msg.payload as MLProposal);
      }
    });

    this.eventBus.subscribe("ml:request", (taskDescription: string) => {
      this.sendTaskToML(taskDescription);
    });
  }

  private sendTaskToML(task: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "task", task }));
    }
  }
}
