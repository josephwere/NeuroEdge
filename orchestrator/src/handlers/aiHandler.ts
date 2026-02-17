// orchestrator/src/handlers/aiHandler.ts
import { Request, Response } from "express";
import axios from "axios";
import { appendEvent } from "@storage/hybrid_db";
import { traceLLMCall } from "@observability/tracing";
import { recordTokenUsage } from "@billing/usage";
import { trackTokenUsage } from "@observability/metrics";

function parseSharedPattern(text: string): { total: number; people: number } | null {
  const m = text
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s+(?:was\s+)?shared\s+(?:to|among)\s+(\d+(?:\.\d+)?)\s+people/);
  if (!m) return null;
  const total = Number(m[1]);
  const people = Number(m[2]);
  if (!Number.isFinite(total) || !Number.isFinite(people) || people === 0) return null;
  return { total, people };
}

function evalArithmeticExpression(text: string): number | null {
  const normalized = text.replace(/\s+/g, "");
  if (!/^[0-9+\-*/().]+$/.test(normalized)) return null;
  try {
    const value = Function(`"use strict"; return (${normalized});`)();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function findLastSharedContext(context: any[]): { total: number; people: number } | null {
  for (let i = context.length - 1; i >= 0; i -= 1) {
    const item = context[i] || {};
    const text = String(item.content || item.text || "").trim();
    if (!text) continue;
    const parsed = parseSharedPattern(text);
    if (parsed) return parsed;
  }
  return null;
}

function buildAssistantResponse(input: string, action: string, context: any[] = []): string {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (!text) return "I can help with questions, coding tasks, and system diagnostics.";
  if (/(^|\s)(hi|hello|hey)\b/.test(lower)) {
    return "Hello. I am ready to help.\n\nAsk a question, math problem, coding issue, or research task.";
  }

  const sharedNow = parseSharedPattern(text);
  if (sharedNow) {
    const each = sharedNow.total / sharedNow.people;
    return `✅ **Math Result**\n\n${sharedNow.total} shared among ${sharedNow.people} people gives **${each} each**.`;
  }

  if (/\bhow many\b.*\beach\b|\beach get\b/.test(lower)) {
    const last = findLastSharedContext(context);
    if (last) {
      const each = last.total / last.people;
      return `✅ **Math Result**\n\nFrom your previous message: ${last.total} ÷ ${last.people} = **${each}** each.`;
    }
  }

  const arithmeticOnly = evalArithmeticExpression(text);
  if (arithmeticOnly !== null) {
    return `✅ **Math Result**\n\n\`${text}\` = **${arithmeticOnly}**`;
  }

  if (lower.includes("day today") || lower.includes("what day is it") || lower.includes("today")) {
    const now = new Date();
    const day = now.toLocaleDateString("en-US", { weekday: "long" });
    const date = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `📅 Today is **${day}, ${date}**.`;
  }

  if (lower.includes("trend") || lower.includes("trending")) {
    return "📈 I can analyze trends, but web-research mode is not enabled yet.\n\nTell me the domain and timeframe, and I will give you a structured analysis from available context.";
  }
  if (action === "analyze_logs") {
    return "This looks like an issue-analysis request. Share the error logs and I will identify root cause and fixes.";
  }
  if (action === "run_tests") {
    return "I can help run and diagnose tests. Tell me your stack and I will give the exact test commands and fixes.";
  }
  if (action === "run_build_checks") {
    return "I can help with build checks. Share your build error output and I will provide targeted fixes.";
  }
  if (action === "prepare_deploy_plan") {
    return "I can draft a production deploy plan with rollout, health checks, rollback, and monitoring steps.";
  }
  if (/\b(code|function|script|example)\b/.test(lower)) {
    return "Here is a starter example:\n\n```ts\nfunction greet(name: string) {\n  return `Hello, ${name}`;\n}\n```\n\nTell me your exact language and goal, and I will tailor it.";
  }
  return "Understood. Give me a bit more detail and I will respond with a concrete answer, not just intent classification.";
}

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
    const assistant = String(
      mlData?.response ||
        buildAssistantResponse(
          String(input || ""),
          String(mlData?.action || fallbackIntent),
          Array.isArray(req.body?.context) ? req.body.context : []
        )
    );
    res.json({
      success: true,
      reasoning: `${usedMesh ? "Mesh" : "ML"} inferred action '${mlData.action || "unknown"}'`,
      intent: mlData.action || "unknown",
      risk: "low",
      response: assistant,
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
    const assistant = buildAssistantResponse(
      String(input || ""),
      fallbackIntent,
      Array.isArray(req.body?.context) ? req.body.context : []
    );
    res.json({
      success: true,
      reasoning: `Fallback inferred action '${fallbackIntent}'`,
      intent: fallbackIntent,
      risk: "low",
      response: assistant,
      ml: {
        status: "fallback",
        action: fallbackIntent,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
