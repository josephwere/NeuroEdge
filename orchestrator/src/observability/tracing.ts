import axios from "axios";
import { appendEvent } from "@storage/hybrid_db";

export interface TraceInput {
  name: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  orgId?: string;
  workspaceId?: string;
  metadata?: Record<string, any>;
}

function nowIso() {
  return new Date().toISOString();
}

async function sendLangfuse(trace: TraceInput) {
  const host = process.env.LANGFUSE_HOST;
  const pub = process.env.LANGFUSE_PUBLIC_KEY;
  const sec = process.env.LANGFUSE_SECRET_KEY;
  if (!host || !pub || !sec) return;
  const auth = Buffer.from(`${pub}:${sec}`).toString("base64");
  const url = `${host.replace(/\/$/, "")}/api/public/ingestion`;
  const payload = {
    batch: [
      {
        id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: nowIso(),
        type: "generation-create",
        body: {
          name: trace.name,
          model: trace.model,
          metadata: {
            provider: trace.provider,
            success: trace.success,
            orgId: trace.orgId,
            workspaceId: trace.workspaceId,
            ...trace.metadata,
          },
          usage: {
            input: trace.inputTokens,
            output: trace.outputTokens,
            total: trace.inputTokens + trace.outputTokens,
          },
        },
      },
    ],
  };
  await axios.post(url, payload, {
    timeout: 3000,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
}

async function sendHelicone(trace: TraceInput) {
  const key = process.env.HELICONE_API_KEY;
  const host = process.env.HELICONE_HOST || "https://api.helicone.ai";
  if (!key) return;
  const payload = {
    event: trace.name,
    provider: trace.provider,
    model: trace.model,
    latency_ms: trace.latencyMs,
    success: trace.success,
    usage: {
      input: trace.inputTokens,
      output: trace.outputTokens,
      total: trace.inputTokens + trace.outputTokens,
    },
    metadata: {
      orgId: trace.orgId,
      workspaceId: trace.workspaceId,
      ...trace.metadata,
    },
    timestamp: nowIso(),
  };
  await axios.post(`${host.replace(/\/$/, "")}/v1/log`, payload, {
    timeout: 3000,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
}

export async function traceLLMCall(trace: TraceInput) {
  appendEvent({
    type: "trace.llm",
    timestamp: Date.now(),
    payload: trace,
  });
  await Promise.allSettled([sendLangfuse(trace), sendHelicone(trace)]);
}

