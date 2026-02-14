import { exec } from "child_process";

export function getGitDiff(): Promise<string> {
  return new Promise((resolve) => {
    exec("git diff", (_, stdout) => resolve(stdout));
  });
}
