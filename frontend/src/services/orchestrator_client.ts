export interface FounderMessage {
  type: "status" | "info" | "warning" | "error";
  message: string;
  timestamp?: number;
}

export interface ExecuteRequest {
  command: string;
  context?: Array<{ role: string; content?: string; text?: string }>;
  kernelId?: string;
}

export interface ExecuteResponse {
  success: boolean;
  reasoning?: string;
  intent?: string;
  risk?: "low" | "medium" | "high";
  logs?: string[];
  results?: Array<{ id?: string; success: boolean; stdout?: string; stderr?: string }>;
  approvals?: Array<{ id: string; message: string; command?: string }>;
  meshStatus?: Array<{ node: string; status: string }>;
}

interface OrchestratorClientOptions {
  baseUrl?: string;
  wsUrl?: string;
  mode?: string;
  safe?: boolean;
}

type FounderHandler = (msg: FounderMessage) => void;

export class OrchestratorClient {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private founderHandlers = new Set<FounderHandler>();

  constructor(options: OrchestratorClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ||
      (import.meta.env.VITE_ORCHESTRATOR_URL as string) ||
      "http://localhost:7070";
    this.wsUrl = options.wsUrl || (import.meta.env.VITE_ORCHESTRATOR_WS_URL as string) || this.deriveWsUrl(this.baseUrl);

    this.connectWebSocket();
  }

  private deriveWsUrl(baseUrl: string): string {
    try {
      const parsed = new URL(baseUrl);
      const restPort = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
      const wsPort = restPort + 1;
      const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${parsed.hostname}:${wsPort}/ws`;
    } catch {
      return "ws://localhost:7071/ws";
    }
  }

  private connectWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.ws = null;
    }
  }

  async execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    const kernelId = req.kernelId || "local";
    const command = (req.command || "").trim();
    if (!command) {
      throw new Error("Command is required");
    }

    const [aiResult, execResult] = await Promise.allSettled([
      this.postJson("/ai", {
        kernelId,
        input: command,
        context: req.context || [],
      }),
      this.postJson("/execute", {
        kernelId,
        command,
      }),
    ]);

    const aiResp = aiResult.status === "fulfilled" ? aiResult.value : null;
    const execResp = execResult.status === "fulfilled" ? execResult.value : null;
    const executeError =
      execResult.status === "rejected"
        ? execResult.reason instanceof Error
          ? execResult.reason.message
          : "Execution failed"
        : "";

    return {
      success: Boolean(execResp?.success ?? aiResp?.success ?? false),
      reasoning: aiResp?.reasoning || (executeError ? "Execution failed before AI reasoning" : undefined),
      intent: aiResp?.intent,
      risk: aiResp?.risk || "low",
      logs: execResp?.stdout ? [String(execResp.stdout)] : [],
      results: [
        {
          id: execResp?.id,
          success: Boolean(execResp?.success && !executeError),
          stdout: execResp?.stdout,
          stderr: execResp?.stderr || executeError,
        },
      ],
      approvals: Array.isArray(execResp?.approvals) ? execResp.approvals : [],
      meshStatus: [],
    };
  }

  sendCommand(cmd: { command?: string; payload?: any }): Promise<ExecuteResponse> {
    const command =
      typeof cmd?.command === "string"
        ? cmd.command
        : typeof cmd?.payload?.command === "string"
          ? cmd.payload.command
          : JSON.stringify(cmd?.payload || cmd || {});
    return this.execute({ command });
  }

  async runCheck(node: string): Promise<{ status: string }> {
    const snapshot = await this.postJson("/kernels", {});
    const kernel = snapshot?.local || snapshot?.[node];
    return { status: kernel?.status || "unknown" };
  }

  async inspect(target: string) {
    const res = await this.execute({ command: `inspect ${target}` });
    this.emitFounderMessage({
      type: res.success ? "status" : "error",
      message: res.success ? `Inspection submitted for ${target}` : `Inspection failed for ${target}`,
      timestamp: Date.now(),
    });
  }

  async queryNodeStatus(target: string) {
    const snapshot = await this.postJson("/kernels", {});
    const status = snapshot?.[target]?.status || snapshot?.local?.status || "unknown";
    this.emitFounderMessage({
      type: "status",
      message: `Node ${target || "local"} status: ${status}`,
      timestamp: Date.now(),
    });
  }

  replaySession(sessionId: string) {
    this.emitFounderMessage({
      type: "info",
      message: `Replay requested for session ${sessionId}`,
      timestamp: Date.now(),
    });
  }

  resetConversation() {
    this.emitFounderMessage({
      type: "info",
      message: "Conversation reset",
      timestamp: Date.now(),
    });
  }

  onFounderMessage(handler: FounderHandler) {
    this.founderHandlers.add(handler);
  }

  offFounderMessage(handler: FounderHandler) {
    this.founderHandlers.delete(handler);
  }

  emitFounderMessage(message: FounderMessage) {
    this.founderHandlers.forEach((handler) => handler(message));
  }

  private async postJson(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${path} failed with status ${response.status}`);
    }
    return response.json();
  }
}
