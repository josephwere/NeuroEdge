// floating_chat/execution/npm_yarn_runner.ts
import { exec } from "child_process";

export async function runDevCommand(cmd: string, cwd?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) reject({ stdout, stderr });
      else resolve({ stdout, stderr });
    });
  });
}
