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

    let fallbackChatResp: any = null;
    const combinedFailureText = `${executeError} ${String(execResp?.stderr || "")}`.toLowerCase();
    const mlFailure = combinedFailureText.includes("ml inference failed");
    const executionFailed = execResult.status === "rejected" || execResp?.success === false;

    if (executionFailed && mlFailure) {
      try {
        fallbackChatResp = await this.postJson("/chat", {
          kernelId,
          message: command,
          text: command,
        });
      } catch {
        fallbackChatResp = null;
      }
    }

    let finalSuccess = Boolean(
      (execResp?.success && !executeError) || fallbackChatResp?.success || aiResp?.success
    );
    let finalStdout = fallbackChatResp?.stdout || execResp?.stdout;
    let finalStderr =
      finalSuccess ? undefined : (fallbackChatResp?.stderr || execResp?.stderr || executeError || "Execution failed");
    let finalReasoning = fallbackChatResp?.success
      ? "Recovered via kernel chat fallback after ML inference failure"
      : aiResp?.reasoning || (executeError ? "Execution failed before AI reasoning" : undefined);

    // Last-resort local fallback: never surface raw ML failure text to users.
    if (!finalSuccess && mlFailure) {
      finalSuccess = true;
      finalStdout = `NeuroEdge local fallback: received "${command}". ML is temporarily unavailable.`;
      finalStderr = undefined;
      finalReasoning = "Recovered via local fallback after ML inference failure";
    }

    return {
      success: finalSuccess,
      reasoning: finalReasoning,
      intent: aiResp?.intent,
      risk: aiResp?.risk || "low",
      logs: [],
      results: [
        {
          id: fallbackChatResp?.id || execResp?.id,
          success: finalSuccess,
          stdout: finalStdout,
          stderr: finalStderr,
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
    const auth = this.resolveAuthContext();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-org-id": auth.orgId,
      "x-workspace-id": auth.workspaceId,
    };
    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }
    if (auth.apiKey) {
      headers["x-api-key"] = auth.apiKey;
      if (!headers.Authorization) {
        headers.Authorization = `Bearer ${auth.apiKey}`;
      }
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${path} failed with status ${response.status}`);
    }
    return response.json();
  }

  private resolveAuthContext(): {
    token: string;
    apiKey: string;
    orgId: string;
    workspaceId: string;
  } {
    const envToken = String((import.meta.env.VITE_NEUROEDGE_JWT as string) || "").trim();
    const envApiKey = String((import.meta.env.VITE_NEUROEDGE_API_KEY as string) || "").trim();
    const envOrg = String((import.meta.env.VITE_DEFAULT_ORG_ID as string) || "").trim();
    const envWorkspace = String((import.meta.env.VITE_DEFAULT_WORKSPACE_ID as string) || "").trim();

    let userToken = "";
    let sessionToken = "";
    let orgId = "";
    let workspaceId = "";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        orgId = String(parsed?.orgId || "");
        workspaceId = String(parsed?.workspaceId || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        orgId = orgId || String(parsed?.orgId || "");
        workspaceId = workspaceId || String(parsed?.workspaceId || "");
      }
    } catch {
      // Ignore malformed local storage values.
    }

    const token = envToken || userToken || sessionToken;
    return {
      token,
      apiKey: envApiKey,
      orgId: orgId || envOrg || "personal",
      workspaceId: workspaceId || envWorkspace || "default",
    };
  }
}
