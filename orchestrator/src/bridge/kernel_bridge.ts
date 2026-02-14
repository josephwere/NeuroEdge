// orchestrator/src/bridge/kernel_bridge.ts
import axios from "axios";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class KernelBridge {
  private baseUrl: string;
  private eventBus: EventBus;
  private logger: Logger;
  private connected = false;
  private authHeaders: Record<string, string>;

  constructor(baseUrl: string, eventBus: EventBus, logger: Logger) {
    this.baseUrl = baseUrl;
    this.eventBus = eventBus;
    this.logger = logger;
    const apiKey = process.env.KERNEL_API_KEY || process.env.NEUROEDGE_API_KEY || "";
    this.authHeaders = apiKey ? { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` } : {};
  }

  /**
   * Soft-connect to kernel.
   * Never throws.
   * Retries a few times, then continues without kernel.
   */
  async connect(retries = 5, delayMs = 2000): Promise<boolean> {
    this.logger.info("KERNEL_BRIDGE", "Connecting to Go kernel...");

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });

        if (res.status === 200) {
          this.connected = true;
          this.logger.info("KERNEL_BRIDGE", "✅ Connected to kernel");

          this.attachEventListeners();
          return true;
        }
      } catch (err: any) {
        this.logger.warn(
          "KERNEL_BRIDGE",
          `⚠️ Kernel not ready (${attempt}/${retries}): ${err.message}`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    this.logger.warn(
      "KERNEL_BRIDGE",
      "❌ Kernel unreachable, continuing without it"
    );

    // Still attach listeners — kernel might come up later
    this.attachEventListeners();

    // Periodically retry in background without crashing orchestrator
    this.startReconnectLoop(delayMs);

    return false;
  }

  /**
   * Subscribe to internal events regardless of kernel state
   */
  private attachEventListeners() {
    this.eventBus.subscribe("kernel:event", (payload) => {
      if (!this.connected) {
        this.logger.warn("KERNEL_BRIDGE", "Kernel down — event skipped");
        return;
      }
      this.sendToKernel(payload);
    });
  }

  /**
   * Send an event to the kernel.
   * Logs warning if kernel is down.
   */
  async sendToKernel(payload: any) {
    if (!this.connected) {
      this.logger.warn("KERNEL_BRIDGE", "Cannot send — kernel is down");
      return;
    }

    try {
      await axios.post(`${this.baseUrl}/events`, payload, { headers: this.authHeaders });
    } catch (err: any) {
      this.logger.warn(
        "KERNEL_BRIDGE",
        `Failed to send event to kernel: ${err.message}`
      );
      this.connected = false; // mark disconnected
    }
  }

  /**
   * Background reconnect loop — tries every delayMs until kernel responds
   */
  private startReconnectLoop(delayMs: number) {
    const loop = async () => {
      if (this.connected) return;

      try {
        const res = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
        if (res.status === 200) {
          this.connected = true;
          this.logger.info("KERNEL_BRIDGE", "✅ Kernel is back online");
        }
      } catch {
        // ignore, will retry
      } finally {
        if (!this.connected) setTimeout(loop, delayMs);
      }
    };

    setTimeout(loop, delayMs);
  }
}
