import { NeuroEdgeTwinNative } from "./NativeNeuroEdgeTwin";
import { TwinAction, TwinBridgeConfig } from "./types";

type PumpState = "stopped" | "running";

type Receipt = {
  actionId: string;
  deviceId: string;
  status: "completed" | "failed";
  result?: Record<string, unknown>;
  error?: string;
};

function buildHeaders(config: TwinBridgeConfig): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (config.headers.apiKey) h["X-API-Key"] = config.headers.apiKey;
  if (config.headers.orgId) h["X-Org-Id"] = config.headers.orgId;
  if (config.headers.workspaceId) h["X-Workspace-Id"] = config.headers.workspaceId;
  if (config.headers.userRole) h["X-User-Role"] = config.headers.userRole;
  if (config.headers.userEmail) h["X-User-Email"] = config.headers.userEmail;
  if (config.headers.userName) h["X-User-Name"] = config.headers.userName;
  h["X-Device-Id"] = config.device.id;
  if (config.headers.bearerToken) h["Authorization"] = `Bearer ${config.headers.bearerToken}`;
  return h;
}

async function jsonFetch<T>(url: string, init: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!resp.ok) {
    const message = body?.error || body?.detail || `HTTP ${resp.status}`;
    throw new Error(String(message));
  }
  return body as T;
}

export class NeuroEdgeTwinActionPump {
  private state: PumpState = "stopped";
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly handled = new Set<string>();

  constructor(
    private readonly config: TwinBridgeConfig,
    private readonly pollMs = 3000
  ) {}

  private base(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async register(): Promise<void> {
    await jsonFetch(this.base("/dashboard/twin/mobile/device/register"), {
      method: "POST",
      headers: buildHeaders(this.config),
      body: JSON.stringify({
        device: {
          id: this.config.device.id,
          platform: this.config.device.platform,
          deviceName: this.config.device.deviceName,
          appVersion: this.config.device.appVersion,
          osVersion: this.config.device.osVersion,
          pushToken: this.config.device.pushToken || "",
          attestationProvider: this.config.device.attestationProvider || "",
          attestationStatus: this.config.device.attestationStatus || "unknown",
          permissions: {
            microphone: true,
            contacts: false,
            call_screening: true,
            notifications: true
          },
          capabilities: {
            call_assist: true,
            voip_answer: true,
            whatsapp_call_assist: true,
            video_avatar: true
          },
          status: "online"
        }
      })
    });
  }

  async sync(partial: Record<string, unknown> = {}): Promise<void> {
    await jsonFetch(this.base("/dashboard/twin/mobile/device/sync"), {
      method: "POST",
      headers: buildHeaders(this.config),
      body: JSON.stringify({
        deviceId: this.config.device.id,
        pushToken: this.config.device.pushToken || "",
        attestationProvider: this.config.device.attestationProvider || "",
        attestationStatus: this.config.device.attestationStatus || "unknown",
        status: "online",
        ...partial
      })
    });
  }

  private async fetchPending(): Promise<TwinAction[]> {
    const url = this.base(
      `/dashboard/twin/mobile/actions/pending?deviceId=${encodeURIComponent(this.config.device.id)}`
    );
    const data = await jsonFetch<{ actions?: TwinAction[] }>(url, {
      method: "GET",
      headers: buildHeaders(this.config)
    });
    return Array.isArray(data.actions) ? data.actions : [];
  }

  private async postReceipt(r: Receipt): Promise<void> {
    await jsonFetch(this.base("/dashboard/twin/mobile/action/receipt"), {
      method: "POST",
      headers: buildHeaders(this.config),
      body: JSON.stringify({
        actionId: r.actionId,
        deviceId: r.deviceId,
        status: r.status,
        result: r.result || {},
        error: r.error || ""
      })
    });
  }

  private async execute(action: TwinAction): Promise<Receipt> {
    try {
      if (action.actionType === "answer_phone_call") {
        const out = await NeuroEdgeTwinNative.answerPhoneCall(action.id, action.payload || {});
        return { actionId: action.id, deviceId: action.deviceId, status: out.ok ? "completed" : "failed", result: out };
      }
      if (action.actionType === "answer_whatsapp_call") {
        const out = await NeuroEdgeTwinNative.answerWhatsAppCall(action.id, action.payload || {});
        return { actionId: action.id, deviceId: action.deviceId, status: out.ok ? "completed" : "failed", result: out };
      }
      if (action.actionType === "answer_video_call") {
        const out = await NeuroEdgeTwinNative.answerVideoCall(action.id, action.payload || {});
        return { actionId: action.id, deviceId: action.deviceId, status: out.ok ? "completed" : "failed", result: out };
      }
      if (action.actionType === "sync_availability") {
        const out = await NeuroEdgeTwinNative.syncAvailability(action.payload || {});
        return { actionId: action.id, deviceId: action.deviceId, status: out.ok ? "completed" : "failed", result: out };
      }
      return {
        actionId: action.id,
        deviceId: action.deviceId,
        status: "failed",
        error: `Unsupported action type: ${action.actionType}`
      };
    } catch (err: any) {
      return {
        actionId: action.id,
        deviceId: action.deviceId,
        status: "failed",
        error: err?.message || String(err)
      };
    }
  }

  private async tick(): Promise<void> {
    const actions = await this.fetchPending();
    for (const action of actions) {
      if (!action?.id || this.handled.has(action.id)) continue;
      this.handled.add(action.id);
      const receipt = await this.execute(action);
      await this.postReceipt(receipt);
    }
  }

  async start(): Promise<void> {
    if (this.state === "running") return;
    this.state = "running";
    await this.register();
    await this.sync();
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, Math.max(1500, this.pollMs));
  }

  stop(): void {
    this.state = "stopped";
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
