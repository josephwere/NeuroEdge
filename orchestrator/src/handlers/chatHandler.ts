// orchestrator/src/handlers/chatHandler.ts
import { Request, Response } from "express";
import { globalKernelManager } from "@services/kernelManager";
import { KernelCommand } from "@services/kernelComm";

/**
 * Handles user chat commands
 */
export async function handleChat(req: Request, res: Response) {
  const kernelId = req.body?.kernelId || "local";
  const message = req.body?.message || req.body?.text;

  if (!kernelId || !message) {
    return res.status(400).json({ error: "Missing kernelId or message" });
  }

  const cmd: KernelCommand = {
    id: `chat-${Date.now()}`,
    type: "chat",
    payload: { message },
    metadata: { user: req.body.user || "unknown" },
  };

  try {
    const result = await globalKernelManager.sendCommand(kernelId, cmd);
    res.json(result);
  } catch (err) {
    console.error("[chatHandler] Error sending chat command:", err);
    res.status(500).json({ error: "Kernel execution failed" });
  }
}
