import { exec } from "child_process";

export function getGitState(): Promise<any> {
  return new Promise((resolve) => {
    exec("git status --porcelain -b", (err, stdout) => {
      resolve({
        raw: stdout,
        clean: stdout.trim() === ""
      });
    });
  });
}
