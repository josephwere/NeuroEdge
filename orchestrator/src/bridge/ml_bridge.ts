// orchestrator/src/bridge/ml_bridge.ts
import axios from "axios";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class MLBridge {
  private baseUrl: string;
  private eventBus: EventBus;
  private logger: Logger;
  private connected = false;

  constructor(baseUrl: string, eventBus: EventBus, logger: Logger) {
    this.baseUrl = baseUrl;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  /**
   * Soft-connect to ML orchestrator.
   * Never crashes the app.
   */
  async connect(retries = 5, delayMs = 2000): Promise<boolean> {
    this.logger.info("ML_BRIDGE", "Connecting to ML orchestrator...");

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });

        this.connected = true;
        this.logger.info("ML_BRIDGE", "✅ Connected to ML system");

        this.attachListeners();
        return true;
      } catch {
        this.logger.warn(
          "ML_BRIDGE",
          `⚠️ ML not ready (${attempt}/${retries}), retrying...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    this.logger.warn(
      "ML_BRIDGE",
      "❌ ML system unreachable, continuing without it"
    );

    // Still attach listeners so ML can come up later
    this.attachListeners();
    return false;
  }

  private attachListeners() {
    this.eventBus.subscribe("ml:request", (payload) => {
      if (!this.connected) {
        this.logger.warn(
          "ML_BRIDGE",
          "ML system down — request skipped"
        );
        return;
      }
      this.forwardToML(payload);
    });
  }

  async forwardToML(payload: any) {
    try {
      const res = await axios.post(`${this.baseUrl}/infer`, payload);
      this.eventBus.emit("ml:response", res.data);
    } catch {
      this.logger.warn("ML_BRIDGE", "ML request failed");
    }
  }
}
