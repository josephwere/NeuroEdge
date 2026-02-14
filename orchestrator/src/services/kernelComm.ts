// orchestrator/src/services/kernelComm.ts
import axios, { AxiosInstance } from "axios";

/* -------------------- */
/* Types */
/* -------------------- */

export interface KernelCommand {
  id: string;
  type: "chat" | "execute" | "ai_inference";
  payload: any;
  metadata?: Record<string, any>;
}

export interface KernelResponse {
  id: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  approvals?: any[];
  reasoning?: string;
  risk?: "low" | "medium" | "high";
  timestamp: string;
}

export interface KernelHealth {
  component: string;
  healthy: boolean;
  lastCheck: string;
  error?: string;
}

export interface KernelNode {
  name: string;
  type: "agent" | "engine" | "kernel";
}

export interface KernelCapabilities {
  version: string;
  capabilities: string[];
  status: "ready" | "busy" | "offline";
  nodes?: KernelNode[];
}

export interface KernelInfo {
  version: string;
  capabilities: string[];
  status: "ready" | "busy" | "offline";
  nodes?: KernelNode[];
}

/* -------------------- */
/* Kernel Client Class */
/* -------------------- */

export class KernelClient {
  private baseUrl: string;
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    const apiKey = process.env.KERNEL_API_KEY || process.env.NEUROEDGE_API_KEY || "";
    const authHeaders: Record<string, string> = apiKey
      ? { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` }
      : {};
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 8000,
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
  }

  /* -------------------- Health -------------------- */
  async getHealth(): Promise<KernelHealth[]> {
    try {
      const resp = await this.client.get("/kernel/health");
      return resp.data;
    } catch (err) {
      console.error("[KernelClient] Health check failed:", err);
      return [];
    }
  }

  /* -------------------- Kernel Info -------------------- */
  async getInfo(): Promise<KernelInfo> {
    try {
      await this.client.get("/health");
      return { version: "v1", capabilities: [], status: "ready" };
    } catch {
      try {
        await this.client.get("/healthz");
        return { version: "v1", capabilities: [], status: "ready" };
      } catch {
        return { version: "unknown", capabilities: [], status: "offline" };
      }
    }
  }

  /* -------------------- Nodes -------------------- */
  async getNodes(): Promise<KernelNode[]> {
    try {
      const resp = await this.client.get("/kernel/nodes");
      return resp.data;
    } catch (err) {
      console.error("[KernelClient] Fetch nodes failed:", err);
      return [];
    }
  }

  /* -------------------- Capabilities -------------------- */
  async getCapabilities(): Promise<KernelCapabilities> {
    try {
      const resp = await this.client.get("/kernel/capabilities");
      return resp.data;
    } catch (err) {
      console.error("[KernelClient] Fetch capabilities failed:", err);
      return { version: "unknown", capabilities: [], status: "offline", nodes: [] };
    }
  }

  /* -------------------- Send Command -------------------- */
  async sendCommand(cmd: KernelCommand): Promise<KernelResponse> {
    try {
      const resp = await this.client.post("/execute", cmd);
      return resp.data;
    } catch (err) {
      console.error("[KernelClient] Command failed:", err);
      return {
        id: cmd.id,
        success: false,
        stderr: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /* -------------------- Retry Wrapper -------------------- */
  async sendWithRetry(cmd: KernelCommand, retries = 2, delayMs = 500): Promise<KernelResponse> {
    let attempt = 0;
    while (attempt <= retries) {
      const res = await this.sendCommand(cmd);
      if (res.success) return res;
      attempt++;
      console.warn(`[KernelClient] Retry ${attempt} for command ${cmd.id}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return {
      id: cmd.id,
      success: false,
      stderr: "Kernel command failed after retries",
      timestamp: new Date().toISOString(),
    };
  }

  /* -------------------- Placeholder for Streaming -------------------- */
  async streamCommand(cmd: KernelCommand, onData: (chunk: any) => void): Promise<void> {
    console.warn("[KernelClient] streamCommand not implemented yet. Placeholder for future NeuroEdge streaming.");
  }
}
