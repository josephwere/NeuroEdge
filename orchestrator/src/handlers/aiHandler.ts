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
  const orchestratorUrl = process.env.ORCHESTRATOR_URL || "http://localhost:7070";
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
    let mlData: any = null;
    let usedMesh = false;
    try {
      const meshResp = await axios.post(`${orchestratorUrl}/mesh/infer`, {
        text: input,
        payload,
        context: req.body?.context || {},
      });
      mlData = meshResp.data?.result || meshResp.data;
      usedMesh = true;
    } catch {
      const mlResp = await axios.post(`${mlUrl}/infer`, {
        text: input,
        payload,
        context: req.body?.context || {},
      });
      mlData = mlResp.data || {};
    }
    appendEvent({
      type: "ml.infer.response",
      timestamp: Date.now(),
      payload: { ...mlData, mesh: usedMesh },
    });
    res.json({
      success: true,
      reasoning: `${usedMesh ? "Mesh" : "ML"} inferred action '${mlData.action || "unknown"}'`,
      intent: mlData.action || "unknown",
      risk: "low",
      ml: { ...mlData, mesh: usedMesh },
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
