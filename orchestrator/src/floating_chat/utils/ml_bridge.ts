// floating_chat/utils/ml_bridge.ts
import { spawn } from "child_process";

export class MLBridge {
  async proposeCommand(command: string, context: string): Promise<string> {
    // Call Python ML orchestrator
    return new Promise((resolve, reject) => {
      const py = spawn("python3", ["-u", "ml_orchestrator/command_proposer.py", command, context]);

      let output = "";
      py.stdout.on("data", (data) => {
        output += data.toString();
      });

      py.stderr.on("data", (data) => {
        console.error("ML Error:", data.toString());
      });

      py.on("close", (code) => {
        resolve(output.trim());
      });
    });
  }
}
