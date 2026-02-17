import { Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";

interface PlannedCommand {
  command: string;
  args: string[];
  reason: string;
}

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\/\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bwget\b.*\|\s*(sh|bash)/i,
];

const ALLOWED_COMMANDS = new Set([
  "pnpm",
  "npm",
  "yarn",
  "git",
  "go",
  "python3",
  "pip",
  "pytest",
  "node",
]);

function sanitizeCwd(raw: string): string {
  const base = path.resolve(process.cwd());
  const next = path.resolve(base, raw || ".");
  if (!next.startsWith(base)) return base;
  return next;
}

function planTask(task: string): PlannedCommand {
  const text = String(task || "").trim();
  const lower = text.toLowerCase();
  if (!text) {
    return { command: "git", args: ["status", "--short"], reason: "default quick repo status" };
  }

  if (lower.startsWith("pnpm ") || lower.startsWith("npm ") || lower.startsWith("yarn ") || lower.startsWith("git ") || lower.startsWith("go ") || lower.startsWith("python3 ") || lower.startsWith("pip ") || lower.startsWith("pytest ") || lower.startsWith("node ")) {
    const tokens = text.split(/\s+/);
    return { command: tokens[0], args: tokens.slice(1), reason: "explicit command requested" };
  }

  if (/\binstall\b/.test(lower) && /\b(dep|package|dependency)\b/.test(lower)) {
    return { command: "pnpm", args: ["install"], reason: "install dependencies" };
  }
  if (/\b(dev|start|run app|serve)\b/.test(lower)) {
    return { command: "pnpm", args: ["run", "dev"], reason: "start development server" };
  }
  if (/\btest\b/.test(lower)) {
    return { command: "pnpm", args: ["test"], reason: "run test suite" };
  }
  if (/\blint\b/.test(lower)) {
    return { command: "pnpm", args: ["run", "lint"], reason: "run linter" };
  }
  if (/\bbuild\b/.test(lower)) {
    return { command: "pnpm", args: ["run", "build"], reason: "run build" };
  }
  if (/\bpush\b/.test(lower) && /\bgithub|git\b/.test(lower)) {
    return { command: "git", args: ["push"], reason: "push local commits to remote" };
  }
  if (/\bstatus\b/.test(lower) && /\bgit|repo\b/.test(lower)) {
    return { command: "git", args: ["status", "--short"], reason: "check repository status" };
  }
  if (/\bbranch\b/.test(lower)) {
    return { command: "git", args: ["branch", "--show-current"], reason: "show current branch" };
  }
  return { command: "git", args: ["status", "--short"], reason: "fallback safe action" };
}

function validateCommand(cmd: PlannedCommand): { ok: boolean; reason?: string } {
  if (!ALLOWED_COMMANDS.has(cmd.command)) {
    return { ok: false, reason: `Command '${cmd.command}' is not in allowlist` };
  }
  const full = [cmd.command, ...cmd.args].join(" ");
  if (BLOCKED_PATTERNS.some((p) => p.test(full))) {
    return { ok: false, reason: "Command blocked by safety policy" };
  }
  return { ok: true };
}

function runWithTimeout(command: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const proc = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: Number(code || 0), stdout, stderr });
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message || "Failed to spawn process" });
    });
  });
}

export async function handleDevAssistant(req: Request, res: Response) {
  const task = String(req.body?.task || req.body?.command || req.body?.input || "");
  const requestedCwd = String(req.body?.cwd || ".");
  const timeoutMs = Math.max(1000, Math.min(120000, Number(req.body?.timeoutMs || 30000)));
  const autoRun = Boolean(req.body?.autoRun ?? true);

  const plan = planTask(task);
  const safety = validateCommand(plan);
  const cwd = sanitizeCwd(requestedCwd);

  if (!safety.ok) {
    return res.status(400).json({
      success: false,
      error: safety.reason,
      planned: plan,
      cwd,
    });
  }

  if (!autoRun) {
    return res.json({
      success: true,
      mode: "plan_only",
      planned: plan,
      cwd,
      message: "Plan generated. Set autoRun=true to execute.",
      timestamp: new Date().toISOString(),
    });
  }

  const result = await runWithTimeout(plan.command, plan.args, cwd, timeoutMs);
  return res.json({
    success: result.code === 0,
    task,
    planned: plan,
    cwd,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timestamp: new Date().toISOString(),
  });
}

