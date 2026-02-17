import { eventBus } from "@/services/eventBus";

interface ExecutionRequest {
  id: string;
  command: string;
  cwd?: string;
}

export const executeCommand = async (req: ExecutionRequest) => {
  const base = String(import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:7070").replace(/\/$/, "");
  eventBus.emit("dev:execute", req);
  eventBus.emit("floating_chat:log_stream", `Running command: ${req.command}`);
  try {
    const aiResp = await fetch(`${base}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: req.command }),
    });
    const aiData: any = await aiResp.json();
    if (aiData?.reasoning) eventBus.emit("floating_chat:log_stream", `Reasoning: ${aiData.reasoning}`);
    if (aiData?.response) eventBus.emit("floating_chat:execution_result", { id: req.id, success: true, stdout: aiData.response });

    const execResp = await fetch(`${base}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: req.command, kernelId: "local" }),
    });
    const execData: any = await execResp.json();
    if (execData?.result?.stdout) eventBus.emit("floating_chat:log_stream", execData.result.stdout);
    if (execData?.result?.stderr) eventBus.emit("floating_chat:log_stream", execData.result.stderr);
    eventBus.emit("floating_chat:execution_result", {
      id: req.id,
      success: Boolean(execData?.result?.success ?? execData?.success),
      stdout: execData?.result?.stdout || aiData?.response || "",
      stderr: execData?.result?.stderr || "",
    });

    if (aiData?.intent === "analyze_logs" || aiData?.intent === "run_build_checks") {
      eventBus.emit("floating_chat:fix_suggestion", {
        id: req.id,
        fixPlan: "Review stderr, missing dependencies, and failing build/test commands.",
      });
    }
  } catch (err: any) {
    eventBus.emit("floating_chat:execution_result", {
      id: req.id,
      success: false,
      stderr: err?.message || "Execution failed",
    });
  }
};
