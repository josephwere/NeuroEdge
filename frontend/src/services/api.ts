import { eventBus } from "@/services/eventBus";

interface ExecutionRequest {
  id: string;
  command: string;
  cwd?: string;
}

// Simulated backend execution
export const executeCommand = async (req: ExecutionRequest) => {
  // Emit to backend for actual execution
  eventBus.emit("dev:execute", req);

  // Simulate streaming logs for demonstration
  const logs = [
    `Running command: ${req.command}`,
    "Step 1: validating environment...",
    "Step 2: running build...",
    "Step 3: analyzing code...",
    "Build completed successfully"
  ];
  eventBus.streamLogs("floating_chat:log_stream", logs);

  // Simulate ML fix suggestion
  setTimeout(() => {
    eventBus.emit("floating_chat:fix_suggestion", { id: req.id, fixPlan: "Check missing dependencies or update package.json" });
  }, logs.length * 250);
};
