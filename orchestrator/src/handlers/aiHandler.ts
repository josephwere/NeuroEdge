// orchestrator/src/handlers/aiHandler.ts
import { Request, Response } from "express";
import axios from "axios";
import { appendEvent } from "@storage/hybrid_db";
import { traceLLMCall } from "@observability/tracing";
import { recordTokenUsage } from "@billing/usage";
import { trackTokenUsage } from "@observability/metrics";

/**
 * Handles AI inference requests via ML service.
 */
export async function handleAIInference(req: Request, res: Response) {
  const startedAt = Date.now();
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
    appendEvent({
      type: "train.signal",
      timestamp: Date.now(),
      payload: {
        source: usedMesh ? "mesh" : "ml",
        intent: mlData.action || "unknown",
        input_len: String(input || "").length,
      },
    });
    const inputTokens = Math.max(1, Math.ceil(String(input || "").length / 4));
    const outputTokens = Math.max(1, Math.ceil(JSON.stringify(mlData || {}).length / 4));
    trackTokenUsage("/ai", inputTokens, outputTokens);
    await recordTokenUsage({
      route: "/ai",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      actor: req.auth?.sub || "anonymous",
      provider: usedMesh ? "mesh" : "ml",
      model: process.env.ML_MODEL_NAME || "neuroedge-ml",
      inputText: input,
      outputText: mlData,
      inputTokens,
      outputTokens,
      stripeCustomerId:
        (req.auth?.raw?.stripe_customer_id as string | undefined) ||
        (req.header("x-stripe-customer-id") as string | undefined),
    });
    await traceLLMCall({
      name: "ai.infer",
      provider: usedMesh ? "mesh" : "ml",
      model: process.env.ML_MODEL_NAME || "neuroedge-ml",
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      success: true,
      orgId: req.auth?.orgId,
      workspaceId: req.auth?.workspaceId,
      metadata: {
        intent: mlData.action || "unknown",
      },
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
    const inputTokens = Math.max(1, Math.ceil(String(input || "").length / 4));
    trackTokenUsage("/ai", inputTokens, 0);
    await recordTokenUsage({
      route: "/ai",
      orgId: req.auth?.orgId || "personal",
      workspaceId: req.auth?.workspaceId || "default",
      actor: req.auth?.sub || "anonymous",
      provider: "fallback",
      model: "rule-based-fallback",
      inputText: input,
      inputTokens,
      outputTokens: 0,
      stripeCustomerId:
        (req.auth?.raw?.stripe_customer_id as string | undefined) ||
        (req.header("x-stripe-customer-id") as string | undefined),
    });
    await traceLLMCall({
      name: "ai.infer",
      provider: "fallback",
      model: "rule-based-fallback",
      inputTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      success: false,
      orgId: req.auth?.orgId,
      workspaceId: req.auth?.workspaceId,
      metadata: { reason: "ml_unavailable", intent: fallbackIntent },
    });
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
