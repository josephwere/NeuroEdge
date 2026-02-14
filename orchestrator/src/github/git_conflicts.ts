import { exec } from "child_process";

export function detectConflicts(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("git diff --name-only --diff-filter=U", (_, stdout) => {
      resolve(stdout.trim().length > 0);
    });
  });
}
