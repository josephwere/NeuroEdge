import { spawn } from "child_process";
import { EventBus } from "@core/event_bus";

export function runCommand(
  command: string,
  args: string[] = [],
  cwd?: string,
  eventBus?: EventBus,
  streamEventName: string = "command:log"
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, shell: true });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      if (eventBus) eventBus.emit(streamEventName, { type: "stdout", text });
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      if (eventBus) eventBus.emit(streamEventName, { type: "stderr", text });
    });

    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject({ stdout, stderr });
    });
  });
}
