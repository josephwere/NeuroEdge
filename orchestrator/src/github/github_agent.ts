import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitOptions {
  cwd?: string;
}

export class GitHubAgent {

  private async run(cmd: string, options?: GitOptions) {
    return execAsync(cmd, { cwd: options?.cwd });
  }

  /* ---------- INIT / CLONE ---------- */

  async clone(repo: string, targetDir?: string) {
    return this.run(`git clone ${repo} ${targetDir || ""}`);
  }

  async init(cwd?: string) {
    return this.run("git init", { cwd });
  }

  /* ---------- STATUS ---------- */

  async status(cwd?: string) {
    return this.run("git status --short", { cwd });
  }

  async diff(cwd?: string) {
    return this.run("git diff", { cwd });
  }

  /* ---------- FETCH / PULL ---------- */

  async fetch(remote = "origin", cwd?: string) {
    return this.run(`git fetch ${remote}`, { cwd });
  }

  async pull(
    remote = "origin",
    branch = "main",
    cwd?: string
  ) {
    return this.run(`git pull ${remote} ${branch}`, { cwd });
  }

  /* ---------- MERGE / REBASE ---------- */

  async merge(
    branch: string,
    noFastForward = true,
    cwd?: string
  ) {
    const flag = noFastForward ? "--no-ff" : "";
    return this.run(`git merge ${flag} ${branch}`, { cwd });
  }

  async rebase(branch: string, cwd?: string) {
    return this.run(`git rebase ${branch}`, { cwd });
  }

  /* ---------- COMMIT ---------- */

  async commit(message: string, cwd?: string) {
    await this.run("git add .", { cwd });
    return this.run(`git commit -m "${message}"`, { cwd });
  }

  /* ---------- PUSH ---------- */

  async push(
    remote = "origin",
    branch = "main",
    cwd?: string
  ) {
    return this.run(`git push ${remote} ${branch}`, { cwd });
  }

  async forcePush(
    remote = "origin",
    branch = "main",
    cwd?: string
  ) {
    // ⚠️ must be approval-gated
    return this.run(`git push ${remote} ${branch} --force-with-lease`, { cwd });
  }

  /* ---------- BRANCH ---------- */

  async createBranch(name: string, checkout = true, cwd?: string) {
    const cmd = checkout
      ? `git checkout -b ${name}`
      : `git branch ${name}`;
    return this.run(cmd, { cwd });
  }

  async checkout(branch: string, cwd?: string) {
    return this.run(`git checkout ${branch}`, { cwd });
  }

  /* ---------- REMOTES ---------- */

  async addRemote(name: string, url: string, cwd?: string) {
    return this.run(`git remote add ${name} ${url}`, { cwd });
  }

  async listRemotes(cwd?: string) {
    return this.run("git remote -v", { cwd });
  }
  }
