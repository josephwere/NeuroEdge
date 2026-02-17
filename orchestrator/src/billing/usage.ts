import { appendEvent, listEvents } from "@storage/hybrid_db";
import { reportStripeMeterEvent } from "@billing/stripe_meter";

function estimateTokensFromText(text: unknown): number {
  const str = typeof text === "string" ? text : JSON.stringify(text || "");
  if (!str) return 0;
  return Math.max(1, Math.ceil(str.length / 4));
}

export interface UsageRecordInput {
  route: string;
  orgId: string;
  workspaceId: string;
  actor: string;
  provider: string;
  model: string;
  inputText?: unknown;
  outputText?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  stripeCustomerId?: string;
}

export async function recordTokenUsage(input: UsageRecordInput) {
  const inputTokens = input.inputTokens ?? estimateTokensFromText(input.inputText);
  const outputTokens = input.outputTokens ?? estimateTokensFromText(input.outputText);
  const totalTokens = inputTokens + outputTokens;
  const payload = {
    route: input.route,
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    actor: input.actor,
    provider: input.provider,
    model: input.model,
    inputTokens,
    outputTokens,
    totalTokens,
  };
  appendEvent({
    type: "billing.usage",
    timestamp: Date.now(),
    payload,
  });

  if (input.stripeCustomerId && totalTokens > 0) {
    try {
      await reportStripeMeterEvent({
        customerId: input.stripeCustomerId,
        meterName: process.env.STRIPE_METER_EVENT_NAME || "neuroedge_tokens",
        value: totalTokens,
      });
      appendEvent({
        type: "billing.stripe_meter.sent",
        timestamp: Date.now(),
        payload: { customerId: input.stripeCustomerId, totalTokens },
      });
    } catch (err: any) {
      appendEvent({
        type: "billing.stripe_meter.failed",
        timestamp: Date.now(),
        payload: { error: err?.message || String(err) },
      });
    }
  }

  return payload;
}

export function summarizeUsage(limit = 2000) {
  const events = listEvents(limit).filter((e) => e.type === "billing.usage");
  const byOrg: Record<string, number> = {};
  const byWorkspace: Record<string, number> = {};
  let total = 0;
  for (const event of events) {
    const p = event.payload || {};
    const t = Number(p.totalTokens || 0);
    total += t;
    const org = String(p.orgId || "unknown");
    const ws = String(p.workspaceId || "unknown");
    byOrg[org] = (byOrg[org] || 0) + t;
    byWorkspace[ws] = (byWorkspace[ws] || 0) + t;
  }
  return {
    totalTokens: total,
    eventCount: events.length,
    byOrg,
    byWorkspace,
  };
}

