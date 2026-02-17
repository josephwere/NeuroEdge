// orchestrator/src/handlers/aiHandler.ts
import { Request, Response } from "express";
import axios from "axios";
import { appendEvent, listEvents } from "@storage/hybrid_db";
import { traceLLMCall } from "@observability/tracing";
import { recordTokenUsage } from "@billing/usage";
import { trackTokenUsage } from "@observability/metrics";
import { runResearch } from "@research/pipeline";

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

interface ToolExecution {
  name: "research" | "math" | "intent";
  success: boolean;
  confidence: number;
  retries: number;
  output: Record<string, any>;
}

const aiCache = new Map<string, { ts: number; data: any }>();

function getCacheTtlMs(): number {
  return Math.max(1000, Number(process.env.AI_CACHE_TTL_MS || 30000));
}

function cacheKey(input: string, context: any[]): string {
  const ctx = JSON.stringify((context || []).slice(-6));
  return `${input}::${ctx}`;
}

function isResearchPrompt(text: string): boolean {
  return /\b(trend|trending|latest|news|research|search|crawl|source|sources|citation|citations|web)\b/i.test(text);
}

function isFactualPrompt(text: string): boolean {
  return /\b(today|latest|current|population|price|when|where|who|what is|what are)\b/i.test(text);
}

function citationModeRequired(text: string): boolean {
  const strict = String(process.env.CITATION_REQUIRED_MODE || "").toLowerCase() === "true";
  return strict && isFactualPrompt(text);
}

function getStyle(req: Request): "concise" | "balanced" | "detailed" {
  const style = String(req.body?.style || req.body?.preferences?.verbosity || "balanced").toLowerCase();
  if (style === "concise" || style === "detailed") return style;
  return "balanced";
}

function retrieveMemoryHints(text: string): string[] {
  const terms = text
    .toLowerCase()
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 3)
    .slice(0, 6);
  if (terms.length === 0) return [];
  const recent = listEvents(600);
  const scored = recent
    .map((evt) => {
      const blob = JSON.stringify(evt.payload || {}).toLowerCase();
      const score = terms.reduce((acc, t) => (blob.includes(t) ? acc + 1 : acc), 0);
      return { evt, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((x) => {
    const payload = x.evt.payload || {};
    const detail =
      payload.query || payload.input || payload.command || payload.message || payload.response || payload.summary || "";
    return String(detail).slice(0, 220);
  });
}

async function callInstructionModel(input: string, memoryHints: string[], style: "concise" | "balanced" | "detailed"): Promise<string | null> {
  const baseUrl = String(process.env.LLM_API_URL || "").trim();
  if (!baseUrl) return null;
  const model = String(process.env.LLM_MODEL_NAME || "neuroedge-7b-instruct");
  const apiKey = String(process.env.LLM_API_KEY || "");
  const timeoutMs = Math.max(1500, Number(process.env.LLM_TIMEOUT_MS || 12000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const prompt = [
      "You are NeuroEdge, a precise and helpful assistant.",
      `Response style: ${style}.`,
      memoryHints.length > 0 ? `Useful context:\n- ${memoryHints.join("\n- ")}` : "",
      `User request: ${input}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function executeResearchTool(query: string): Promise<ToolExecution> {
  const maxRetries = 2;
  let retries = 0;
  while (retries <= maxRetries) {
    try {
      const result = await runResearch(query);
      return {
        name: "research",
        success: true,
        confidence: result.citations.length > 0 ? 0.82 : 0.55,
        retries,
        output: result as Record<string, any>,
      };
    } catch {
      retries += 1;
    }
  }
  return {
    name: "research",
    success: false,
    confidence: 0.2,
    retries,
    output: {},
  };
}

function executeMathTool(text: string, context: any[]): ToolExecution | null {
  const direct = evalArithmeticExpression(text);
  if (direct !== null) {
    return {
      name: "math",
      success: true,
      confidence: 0.95,
      retries: 0,
      output: { value: direct, expression: text },
    };
  }
  const shared = parseSharedPattern(text) || findLastSharedContext(context);
  if (shared && /\b(each|get|share|shared)\b/i.test(text)) {
    return {
      name: "math",
      success: true,
      confidence: 0.9,
      retries: 0,
      output: { value: shared.total / shared.people, total: shared.total, people: shared.people },
    };
  }
  return null;
}

function verifyResponseQuality(response: string, toolOutputs: ToolExecution[], needsCitation: boolean): { ok: boolean; note?: string } {
  if (!response || response.trim().length < 8) {
    return { ok: false, note: "too_short" };
  }
  if (needsCitation) {
    const research = toolOutputs.find((t) => t.name === "research");
    const cites = Number(research?.output?.citations?.length || 0);
    if (cites < 1) {
      return { ok: false, note: "missing_citations" };
    }
  }
  return { ok: true };
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
  const style = getStyle(req);
  const citationRequired = citationModeRequired(text);
  const contextArr = Array.isArray(req.body?.context) ? req.body.context : [];
  const key = cacheKey(String(input || ""), contextArr);
  const cached = aiCache.get(key);
  if (cached && Date.now() - cached.ts < getCacheTtlMs()) {
    return res.json(cached.data);
  }

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
    const toolOutputs: ToolExecution[] = [];
    const mathOutput = executeMathTool(String(input || ""), contextArr);
    if (mathOutput) toolOutputs.push(mathOutput);
    if (isResearchPrompt(String(input || "")) || citationRequired) {
      toolOutputs.push(await executeResearchTool(String(input || "")));
    }

    const memoryHints = retrieveMemoryHints(String(input || ""));
    const researchTool = toolOutputs.find((t) => t.name === "research" && t.success);
    const mathTool = toolOutputs.find((t) => t.name === "math" && t.success);

    let assistant = "";
    if (researchTool?.output?.summary) {
      assistant = String(researchTool.output.summary);
    } else if (mathTool?.output?.value !== undefined) {
      assistant = `✅ **Math Result**\n\n**${mathTool.output.value}**`;
    } else {
      const llmText = await callInstructionModel(String(input || ""), memoryHints, style);
      assistant = String(
        llmText ||
          mlData?.response ||
          buildAssistantResponse(
            String(input || ""),
            String(mlData?.action || fallbackIntent),
            contextArr
          )
      );
    }

    if (style === "concise") {
      assistant = assistant.split("\n").slice(0, 4).join("\n");
    } else if (style === "detailed" && memoryHints.length > 0) {
      assistant += `\n\n### Related Context\n${memoryHints.map((h) => `- ${h}`).join("\n")}`;
    }

    const verification = verifyResponseQuality(assistant, toolOutputs, citationRequired);
    if (!verification.ok) {
      assistant += "\n\n⚠️ Confidence is limited for this answer. Please refine query or provide source constraints.";
    }

    const responsePayload = {
      success: true,
      reasoning: `${usedMesh ? "Mesh" : "ML"} inferred action '${mlData.action || "unknown"}'`,
      intent: mlData.action || "unknown",
      risk: "low",
      response: assistant,
      confidence: verification.ok ? 0.84 : 0.52,
      model: process.env.LLM_MODEL_NAME || process.env.ML_MODEL_NAME || "neuroedge-ml",
      tools: toolOutputs.map((t) => ({
        name: t.name,
        success: t.success,
        confidence: t.confidence,
        retries: t.retries,
      })),
      citations: Array.isArray(researchTool?.output?.citations) ? researchTool?.output?.citations : [],
      ml: { ...mlData, mesh: usedMesh },
      timestamp: new Date().toISOString(),
    };
    aiCache.set(key, { ts: Date.now(), data: responsePayload });
    res.json(responsePayload);
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
      contextArr
    );
    const responsePayload = {
      success: true,
      reasoning: `Fallback inferred action '${fallbackIntent}'`,
      intent: fallbackIntent,
      risk: "low",
      response: assistant,
      confidence: 0.45,
      tools: [{ name: "intent", success: true, confidence: 0.45, retries: 0 }],
      ml: {
        status: "fallback",
        action: fallbackIntent,
      },
      timestamp: new Date().toISOString(),
    };
    aiCache.set(key, { ts: Date.now(), data: responsePayload });
    res.json(responsePayload);
  }
}
