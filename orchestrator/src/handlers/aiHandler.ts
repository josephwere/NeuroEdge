// orchestrator/src/handlers/aiHandler.ts
import { Request, Response } from "express";
import axios from "axios";
import { appendEvent } from "@storage/hybrid_db";

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
  const text = String(input || "").toLowerCase();
  const fallbackIntent = text.includes("error") || text.includes("fail")
    ? "analyze_logs"
    : text.includes("build") || text.includes("compile")
      ? "run_build_checks"
      : text.includes("test")
        ? "run_tests"
        : "gather_context";

  try {
    appendEvent({
      type: "ml.infer.request",
      timestamp: Date.now(),
      payload: { input, payload },
    });
    const mlResp = await axios.post(`${mlUrl}/infer`, {
      text: input,
      payload,
      context: req.body?.context || {},
    });

    const mlData = mlResp.data || {};
    appendEvent({
      type: "ml.infer.response",
      timestamp: Date.now(),
      payload: mlData,
    });
    res.json({
      success: true,
      reasoning: `ML inferred action '${mlData.action || "unknown"}'`,
      intent: mlData.action || "unknown",
      risk: "low",
      ml: mlData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[aiHandler] ML unavailable, returning fallback intent");
    res.json({
      success: true,
      reasoning: `Fallback inferred action '${fallbackIntent}'`,
      intent: fallbackIntent,
      risk: "low",
      ml: {
        status: "fallback",
        action: fallbackIntent,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
