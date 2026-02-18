import axios, { AxiosInstance } from "axios";

export type MobileTwinActionStatus = "completed" | "failed";

export interface MobileTwinAction {
  id: string;
  deviceId: string;
  actionType: string;
  payload: Record<string, any>;
  createdAt: number;
  expiresAt: number;
}

export interface MobileTwinExecutionResult {
  status: MobileTwinActionStatus;
  result?: Record<string, any>;
  error?: string;
}

export interface MobileTwinHeaders {
  apiKey?: string;
  orgId?: string;
  workspaceId?: string;
  role?: string;
  userEmail?: string;
  userName?: string;
  deviceId?: string;
  bearerToken?: string;
}

export interface MobileTwinClientConfig {
  baseUrl: string;
  headers: MobileTwinHeaders;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  device: {
    id: string;
    platform: "android" | "ios";
    deviceName: string;
    appVersion: string;
    osVersion: string;
    attestationProvider?: string;
    attestationStatus?: "trusted" | "unknown" | "failed";
    pushToken?: string;
  };
}

export interface MobileTwinActionHandlers {
  onAnswerPhoneCall?: (action: MobileTwinAction) => Promise<MobileTwinExecutionResult>;
  onAnswerWhatsappCall?: (action: MobileTwinAction) => Promise<MobileTwinExecutionResult>;
  onAnswerVideoCall?: (action: MobileTwinAction) => Promise<MobileTwinExecutionResult>;
  onSyncAvailability?: (action: MobileTwinAction) => Promise<MobileTwinExecutionResult>;
  onUnknownAction?: (action: MobileTwinAction) => Promise<MobileTwinExecutionResult>;
}

function buildRequestHeaders(h: MobileTwinHeaders): Record<string, string> {
  const out: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (h.apiKey) out["X-API-Key"] = h.apiKey;
  if (h.orgId) out["X-Org-Id"] = h.orgId;
  if (h.workspaceId) out["X-Workspace-Id"] = h.workspaceId;
  if (h.role) out["X-User-Role"] = h.role;
  if (h.userEmail) out["X-User-Email"] = h.userEmail;
  if (h.userName) out["X-User-Name"] = h.userName;
  if (h.deviceId) out["X-Device-Id"] = h.deviceId;
  if (h.bearerToken) out["Authorization"] = `Bearer ${h.bearerToken}`;
  return out;
}

export class MobileTwinClient {
  private readonly api: AxiosInstance;
  private readonly config: MobileTwinClientConfig;
  private readonly handlers: MobileTwinActionHandlers;
  private pollingTimer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;
  private readonly handledActionIds = new Set<string>();

  constructor(config: MobileTwinClientConfig, handlers: MobileTwinActionHandlers = {}) {
    this.config = config;
    const timeout = Math.max(2000, Number(config.requestTimeoutMs || 15000));
    this.api = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ""),
      timeout,
      headers: buildRequestHeaders({
        ...config.headers,
        deviceId: config.device.id,
      }),
    });
    this.handlers = handlers;
  }

  async bootstrap(): Promise<any> {
    const { data } = await this.api.get("/dashboard/twin/mobile/bootstrap");
    return data;
  }

  async registerDevice(): Promise<any> {
    const { device } = this.config;
    const { data } = await this.api.post("/dashboard/twin/mobile/device/register", {
      device: {
        id: device.id,
        platform: device.platform,
        deviceName: device.deviceName,
        appVersion: device.appVersion,
        osVersion: device.osVersion,
        pushToken: device.pushToken || "",
        attestationProvider: device.attestationProvider || "",
        attestationStatus: device.attestationStatus || "unknown",
        permissions: {
          microphone: true,
          contacts: false,
          call_screening: true,
          notifications: true,
          accessibility: false,
        },
        capabilities: {
          call_assist: true,
          voip_answer: true,
          whatsapp_call_assist: true,
          video_avatar: true,
        },
        status: "online",
      },
    });
    return data;
  }

  async syncDevice(partial: Record<string, any> = {}): Promise<any> {
    const device = this.config.device;
    const { data } = await this.api.post("/dashboard/twin/mobile/device/sync", {
      deviceId: device.id,
      pushToken: device.pushToken || "",
      attestationProvider: device.attestationProvider || "",
      attestationStatus: device.attestationStatus || "unknown",
      status: "online",
      permissions: {
        call_screening: true,
        microphone: true,
        notifications: true,
      },
      capabilities: {
        call_assist: true,
        voip_answer: true,
        whatsapp_call_assist: true,
        video_avatar: true,
      },
      ...partial,
    });
    return data;
  }

  async fetchPendingActions(): Promise<MobileTwinAction[]> {
    const deviceId = encodeURIComponent(this.config.device.id);
    const { data } = await this.api.get(`/dashboard/twin/mobile/actions/pending?deviceId=${deviceId}`);
    const actions = Array.isArray(data?.actions) ? data.actions : [];
    return actions as MobileTwinAction[];
  }

  async submitReceipt(action: MobileTwinAction, result: MobileTwinExecutionResult): Promise<any> {
    const { data } = await this.api.post("/dashboard/twin/mobile/action/receipt", {
      actionId: action.id,
      deviceId: action.deviceId,
      status: result.status,
      result: result.result || {},
      error: result.error || "",
    });
    return data;
  }

  private async executeAction(action: MobileTwinAction): Promise<MobileTwinExecutionResult> {
    const kind = String(action.actionType || "").trim().toLowerCase();
    try {
      if (kind === "answer_phone_call" && this.handlers.onAnswerPhoneCall) {
        return await this.handlers.onAnswerPhoneCall(action);
      }
      if (kind === "answer_whatsapp_call" && this.handlers.onAnswerWhatsappCall) {
        return await this.handlers.onAnswerWhatsappCall(action);
      }
      if (kind === "answer_video_call" && this.handlers.onAnswerVideoCall) {
        return await this.handlers.onAnswerVideoCall(action);
      }
      if (kind === "sync_availability" && this.handlers.onSyncAvailability) {
        return await this.handlers.onSyncAvailability(action);
      }
      if (this.handlers.onUnknownAction) {
        return await this.handlers.onUnknownAction(action);
      }
      return {
        status: "failed",
        error: `No handler for action type: ${kind}`,
      };
    } catch (err: any) {
      return {
        status: "failed",
        error: err?.message || String(err),
      };
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const pending = await this.fetchPendingActions();
      for (const action of pending) {
        if (!action?.id || this.handledActionIds.has(action.id)) continue;
        this.handledActionIds.add(action.id);
        const result = await this.executeAction(action);
        await this.submitReceipt(action, result);
      }
    } finally {
      this.inFlight = false;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.registerDevice();
    await this.syncDevice();
    await this.pollOnce();
    const interval = Math.max(1500, Number(this.config.pollIntervalMs || 3000));
    this.pollingTimer = setInterval(() => {
      void this.pollOnce();
    }, interval);
  }

  stop(): void {
    this.running = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }
}
