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
  response?: string;
  confidence?: number;
  citations?: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  trust?: {
    why?: string;
    freshnessHours?: number | null;
    sourceQualityScore?: number;
    contradictionRisk?: number;
    citationCount?: number;
  };
  logs?: string[];
  results?: Array<{ id?: string; success: boolean; stdout?: string; stderr?: string }>;
  approvals?: Array<{ id: string; message: string; command?: string }>;
  meshStatus?: Array<{ node: string; status: string }>;
}

interface ResearchResponse {
  success: boolean;
  query: string;
  summary: string;
  citations?: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  pagesFetched?: number;
}

interface BrainstormResponse {
  success: boolean;
  topic: string;
  summary: string;
  ideas?: Array<{
    title: string;
    what: string;
    impact: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
    firstStep: string;
  }>;
}

interface DevAssistResponse {
  success: boolean;
  task?: string;
  planned?: { command: string; args: string[]; reason: string };
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  message?: string;
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
    if (command.toLowerCase().startsWith("/brainstorm")) {
      const topic = command.replace(/^\/brainstorm\s*/i, "").trim() || "new product idea";
      const data = await this.brainstorm(topic);
      const ideaLines = (data.ideas || [])
        .map((i, idx) => `${idx + 1}. ${i.title} (${i.impact}/${i.effort})\n   ${i.what}\n   First step: ${i.firstStep}`)
        .join("\n\n");
      return {
        success: data.success,
        reasoning: "Brainstorm pipeline generated structured options",
        intent: "brainstorm",
        risk: "low",
        response: `## Brainstorm: ${data.topic}\n\n${data.summary}\n\n${ideaLines}`,
        logs: [],
        results: [{ id: `brainstorm-${Date.now()}`, success: data.success, stdout: data.summary }],
      };
    }
    if (command.toLowerCase().startsWith("/dev ")) {
      const task = command.replace(/^\/dev\s+/i, "").trim();
      const data = await this.devAssist(task, ".");
      const prettyPlan = data.planned
        ? `${data.planned.command} ${Array.isArray(data.planned.args) ? data.planned.args.join(" ") : ""}`.trim()
        : "";
      const body = [
        `Task: ${data.task || task}`,
        prettyPlan ? `Planned: ${prettyPlan}` : "",
        data.cwd ? `CWD: ${data.cwd}` : "",
        data.stdout ? `\nOutput:\n${data.stdout}` : "",
        data.stderr ? `\nErrors:\n${data.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        success: data.success,
        reasoning: "Developer assistant planned and executed a local-safe command",
        intent: "dev_assist",
        risk: data.success ? "low" : "medium",
        response: body,
        logs: [],
        results: [{ id: `dev-${Date.now()}`, success: data.success, stdout: data.stdout, stderr: data.stderr }],
      };
    }

    const chatLike = this.isChatPrompt(command);
    const researchLike = chatLike && this.isResearchPrompt(command);
    const style = this.resolveStylePreference();
    const aiPromise = this.postJson("/ai", {
      kernelId,
      input: command,
      context: req.context || [],
      style,
    });
    const researchPromise = researchLike
      ? this.postJson("/research", {
          query: command,
          context: req.context || [],
        })
      : Promise.resolve(null);
    const execPromise = chatLike
      ? Promise.resolve(null)
      : this.postJson("/execute", {
          kernelId,
          command,
        });

    const [aiResult, execResult, researchResult] = await Promise.allSettled([
      aiPromise,
      execPromise,
      researchPromise,
    ]);

    const aiResp = aiResult.status === "fulfilled" ? aiResult.value : null;
    const execResp = execResult.status === "fulfilled" ? execResult.value : null;
    const researchResp: ResearchResponse | null =
      researchResult.status === "fulfilled" ? (researchResult.value as ResearchResponse | null) : null;
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

    const assistantText = String(researchResp?.summary || aiResp?.response || "");
    let finalSuccess = Boolean(
      (execResp?.success && !executeError) || fallbackChatResp?.success || aiResp?.success || researchResp?.success
    );
    let finalStdout = assistantText || fallbackChatResp?.stdout || execResp?.stdout;
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
      response: assistantText || undefined,
      confidence: aiResp?.confidence,
      citations: Array.isArray(aiResp?.citations) ? aiResp.citations : undefined,
      trust: aiResp?.trust,
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
      meshStatus: researchResp?.pagesFetched
        ? [{ node: "research", status: `Fetched ${researchResp.pagesFetched} pages` }]
        : [],
    };
  }

  private isChatPrompt(command: string): boolean {
    const text = String(command || "").trim();
    if (!text) return true;
    const lower = text.toLowerCase();
    if (text.includes("\n")) return false;
    if (/[|;&<>]/.test(text)) return false;
    const cliStarters = [
      "cd ", "ls", "pwd", "git ", "pnpm ", "npm ", "yarn ", "go ", "python", "pip ",
      "curl ", "wget ", "cat ", "mkdir ", "rm ", "cp ", "mv ", "touch ", "echo ",
      "docker ", "kubectl ", "node ", "npx ", "make ", "chmod ", "chown ", "sudo ",
    ];
    if (cliStarters.some((p) => lower === p.trim() || lower.startsWith(p))) return false;
    if (text.endsWith("?")) return true;
    if (/\b(what|how|why|when|where|who|help|explain|trend|trending)\b/i.test(text)) return true;
    return text.split(" ").length >= 2;
  }

  private isResearchPrompt(command: string): boolean {
    const text = String(command || "").trim().toLowerCase();
    if (!text) return false;
    return /\b(trend|trending|latest|news|research|search|crawl|source|sources|citation|citations|web)\b/.test(text);
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

  async submitTrainingFeedback(input: {
    query: string;
    response: string;
    rating: "up" | "down" | "neutral";
    tags?: string[];
    citations?: Array<{ title?: string; url?: string }>;
  }) {
    return this.postJson("/training/feedback", input as Record<string, unknown>);
  }

  async brainstorm(topic: string): Promise<BrainstormResponse> {
    return this.postJson("/brainstorm", { topic }) as Promise<BrainstormResponse>;
  }

  async devAssist(task: string, cwd = ".", autoRun = true): Promise<DevAssistResponse> {
    return this.postJson("/dev/assist", { task, cwd, autoRun }) as Promise<DevAssistResponse>;
  }

  private async postJson(path: string, body: Record<string, unknown>) {
    const auth = this.resolveAuthContext();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-org-id": auth.orgId,
      "x-workspace-id": auth.workspaceId,
    };
    if (auth.userEmail) headers["x-user-email"] = auth.userEmail;
    if (auth.userName) headers["x-user-name"] = auth.userName;
    if (auth.userRole) headers["x-user-role"] = auth.userRole;
    if (auth.deviceId) headers["x-device-id"] = auth.deviceId;
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
    userEmail: string;
    userName: string;
    userRole: string;
    deviceId: string;
  } {
    const envToken = String((import.meta.env.VITE_NEUROEDGE_JWT as string) || "").trim();
    const envApiKey = String((import.meta.env.VITE_NEUROEDGE_API_KEY as string) || "").trim();
    const envOrg = String((import.meta.env.VITE_DEFAULT_ORG_ID as string) || "").trim();
    const envWorkspace = String((import.meta.env.VITE_DEFAULT_WORKSPACE_ID as string) || "").trim();

    let userToken = "";
    let sessionToken = "";
    let orgId = "";
    let workspaceId = "";
    let userEmail = "";
    let userName = "";
    let userRole = "";
    let deviceId = "";
    try {
      deviceId = localStorage.getItem("neuroedge_device_id") || "";
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("neuroedge_device_id", deviceId);
      }
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        orgId = String(parsed?.orgId || "");
        workspaceId = String(parsed?.workspaceId || "");
        userEmail = String(parsed?.email || "");
        userName = String(parsed?.name || "");
        userRole = String(parsed?.role || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        orgId = orgId || String(parsed?.orgId || "");
        workspaceId = workspaceId || String(parsed?.workspaceId || "");
        userEmail = userEmail || String(parsed?.email || "");
        userName = userName || String(parsed?.name || "");
        userRole = userRole || String(parsed?.role || "");
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
      userEmail,
      userName,
      userRole,
      deviceId,
    };
  }

  private resolveStylePreference(): "concise" | "balanced" | "detailed" {
    try {
      const raw = localStorage.getItem("neuroedge_profile_settings");
      if (!raw) return "balanced";
      const parsed = JSON.parse(raw);
      const v = String(parsed?.aiVerbosity || parsed?.verbosity || "balanced").toLowerCase();
      if (v === "concise" || v === "detailed" || v === "balanced") return v as any;
    } catch {
      // ignore
    }
    return "balanced";
  }
}
