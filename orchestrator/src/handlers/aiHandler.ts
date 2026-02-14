// orchestrator/src/handlers/aiHandler.ts
import { Request, Response } from "express";
import axios from "axios";

/**
 * Handles AI inference requests via ML service.
 */
export async function handleAIInference(req: Request, res: Response) {
  const input = req.body?.input || req.body?.text || req.body?.message || "";
  const payload = req.body?.payload || {};

  if (!input && Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "Missing input" });
  }

  const mlUrl = process.env.ML_URL || "http://localhost:8090";

  try {
    const mlResp = await axios.post(`${mlUrl}/infer`, {
      text: input,
      payload,
      context: req.body?.context || {},
    });

    const mlData = mlResp.data || {};
    res.json({
      success: true,
      reasoning: `ML inferred action '${mlData.action || "unknown"}'`,
      intent: mlData.action || "unknown",
      risk: "low",
      ml: mlData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[aiHandler] Error during AI inference:", err);
    res.status(500).json({ error: "ML inference failed" });
  }
}
