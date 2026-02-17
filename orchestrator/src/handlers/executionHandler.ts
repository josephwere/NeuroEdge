import { Request, Response } from "express";
import { globalKernelManager } from "@services/kernelManager";
import { KernelCommand } from "@services/kernelComm";
import { appendEvent } from "@storage/hybrid_db";

function isRiskyCommand(code: string): boolean {
  const lower = code.toLowerCase();
  const patterns = [
    "rm -rf /",
    "shutdown",
    "reboot",
    "mkfs",
    "dd if=",
    ":(){:|:&};:",
    "chmod -r 777 /",
  ];
  return patterns.some((p) => lower.includes(p));
}

/**
 * Handles code/command execution requests
 */
export async function handleExecution(req: Request, res: Response) {
  const kernelId = req.body?.kernelId || "local";
  const code = req.body?.code || req.body?.command || "";

  if (!code) {
    return res.status(400).json({ error: "Missing code or command" });
  }
  const policyBlock = String(process.env.POLICY_BLOCK_RISKY_COMMANDS || "true").toLowerCase() === "true";
  if (policyBlock && isRiskyCommand(code)) {
    appendEvent({
      type: "policy.blocked_execution",
      timestamp: Date.now(),
      payload: { kernelId, code, actor: req.auth?.sub || "unknown", reason: "risky_command" },
    });
    return res.status(403).json({
      error: "Execution blocked by policy",
      risk: "high",
      reason: "risky_command",
    });
  }

  const cmd: KernelCommand = {
    id: `exec-${Date.now()}`,
    type: "execute",
    payload: { code },
  };

  try {
    appendEvent({
      type: "execute.request",
      timestamp: Date.now(),
      payload: { kernelId, code },
    });
    const result = await globalKernelManager.sendCommand(kernelId, cmd);
    appendEvent({
      type: "execute.response",
      timestamp: Date.now(),
      payload: { kernelId, result },
    });
    res.json(result);
  } catch (err) {
    console.error("[executionHandler] Error executing code:", err);
    res.status(500).json({ error: "Kernel execution failed" });
  }
}
