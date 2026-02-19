// orchestrator/src/bridge/ml_bridge.ts
import axios from "axios";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class MLBridge {
  private baseUrl: string;
  private eventBus: EventBus;
  private logger: Logger;
  private connected = false;
  private consecutiveFailures = 0;
  private reconnecting = false;

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
        const timeoutMs = Math.max(1500, Number(process.env.ML_HEALTH_TIMEOUT_MS || 5000));
        await axios.get(`${this.baseUrl}/health`, { timeout: timeoutMs });

        this.connected = true;
        this.consecutiveFailures = 0;
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
    this.startReconnectLoop(Math.max(1500, Number(process.env.ML_RECONNECT_MS || 3000)));
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

  private normalizePayload(payload: any): Record<string, any> {
    if (typeof payload === "string") {
      return { text: payload, payload: {}, context: {} };
    }
    if (payload && typeof payload === "object") {
      const text =
        typeof payload.text === "string"
          ? payload.text
          : typeof payload.input === "string"
            ? payload.input
            : typeof payload.message === "string"
              ? payload.message
              : "";
      return {
        text,
        payload,
        context: payload.context && typeof payload.context === "object" ? payload.context : {},
      };
    }
    return { text: String(payload ?? ""), payload: {}, context: {} };
  }

  async forwardToML(payload: any) {
    const body = this.normalizePayload(payload);
    try {
      const timeoutMs = Math.max(3000, Number(process.env.ML_INFER_TIMEOUT_MS || 12000));
      const res = await axios.post(`${this.baseUrl}/infer`, body, { timeout: timeoutMs });
      this.eventBus.emit("ml:response", res.data);
      this.consecutiveFailures = 0;
    } catch {
      this.logger.warn("ML_BRIDGE", "ML request failed");
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= Math.max(2, Number(process.env.ML_FAILURE_THRESHOLD || 3))) {
        this.connected = false;
        this.startReconnectLoop(Math.max(1500, Number(process.env.ML_RECONNECT_MS || 3000)));
      }
    }
  }

  private startReconnectLoop(delayMs: number) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    const loop = async () => {
      if (this.connected) {
        this.reconnecting = false;
        return;
      }
      try {
        const timeoutMs = Math.max(1500, Number(process.env.ML_HEALTH_TIMEOUT_MS || 5000));
        await axios.get(`${this.baseUrl}/health`, { timeout: timeoutMs });
        this.connected = true;
        this.consecutiveFailures = 0;
        this.reconnecting = false;
        this.logger.info("ML_BRIDGE", "✅ ML system is back online");
      } catch {
        // ignore
      } finally {
        if (!this.connected) setTimeout(loop, delayMs);
      }
    };
    setTimeout(loop, delayMs);
  }
}
