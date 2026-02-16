// orchestrator/src/handlers/chatHandler.ts
import { Request, Response } from "express";
import { globalKernelManager } from "@services/kernelManager";
import { KernelCommand } from "@services/kernelComm";
import { appendEvent } from "@storage/hybrid_db";

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
    appendEvent({
      type: "chat.request",
      timestamp: Date.now(),
      payload: { kernelId, message },
    });
    const result = await globalKernelManager.sendCommand(kernelId, cmd);
    appendEvent({
      type: "chat.response",
      timestamp: Date.now(),
      payload: { kernelId, result },
    });
    res.json(result);
  } catch (err) {
    console.error("[chatHandler] Error sending chat command:", err);
    res.status(500).json({ error: "Kernel execution failed" });
  }
}
