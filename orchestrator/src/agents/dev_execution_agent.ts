import { OrchestratorAgent } from "@core/agent_manager";
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { PermissionManager } from "@utils/permissions";
import { runCommand } from "@utils/shell";
import { ExecutionRequest, ExecutionResult } from "@types/execution";

export class DevExecutionAgent implements OrchestratorAgent {
  constructor(
    private bus: EventBus,
    private logger: Logger,
    private permissions: PermissionManager
  ) {}

  name(): string {
    return "DevExecutionAgent";
  }

  start(): void {
    this.logger.info(this.name(), "Started");

    this.bus.subscribe("execute:approved", async (req: ExecutionRequest) => {
      await this.handleExecution(req);
    });
  }

  private async handleExecution(req: ExecutionRequest) {
    if (!this.permissions.validate(req)) {
      this.logger.warn(this.name(), "Execution blocked by permissions");
      return;
    }

    this.logger.info(this.name(), `Executing: ${req.command} ${req.args?.join(" ") || ""}`);

    try {
      const result = await runCommand(req.command, req.args, req.cwd);
      const response: ExecutionResult = {
        id: req.id,
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      };
      this.bus.emit("dev:result", response);
    } catch (err: any) {
      const response: ExecutionResult = {
        id: req.id,
        success: false,
        stdout: err.stdout || "",
        stderr: err.stderr || "Execution failed",
      };
      this.bus.emit("dev:result", response);
    }
  }
  }
