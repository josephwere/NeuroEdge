import { appendEvent, listEvents } from "@storage/hybrid_db";

export interface TrainingSampleInput {
  query: string;
  response: string;
  rating: "up" | "down" | "neutral";
  orgId?: string;
  workspaceId?: string;
  actor?: string;
  tags?: string[];
  citations?: Array<{ title?: string; url?: string }>;
}

export interface TrainingSampleGuardResult {
  accepted: boolean;
  reason?: string;
  normalized: TrainingSampleInput;
}

function normalizeSample(sample: TrainingSampleInput): TrainingSampleInput {
  const ratingRaw = String(sample.rating || "neutral").toLowerCase();
  const rating: "up" | "down" | "neutral" =
    ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : "neutral";
  return {
    query: String(sample.query || "").trim(),
    response: String(sample.response || "").trim(),
    rating,
    orgId: sample.orgId || "personal",
    workspaceId: sample.workspaceId || "default",
    actor: sample.actor || "unknown",
    tags: Array.isArray(sample.tags)
      ? sample.tags
          .map((t) => String(t || "").trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 32)
      : [],
    citations: Array.isArray(sample.citations)
      ? sample.citations
          .map((c) => ({
            title: String(c?.title || "").trim(),
            url: String(c?.url || "").trim(),
          }))
          .filter((c) => c.title || c.url)
          .slice(0, 20)
      : [],
  };
}

function qualityReason(sample: TrainingSampleInput): string | null {
  if (!sample.query || !sample.response) return "missing_query_or_response";
  if (sample.query.length < 3) return "query_too_short";
  if (sample.response.length < 8) return "response_too_short";
  const q = sample.query.toLowerCase();
  const r = sample.response.toLowerCase();
  if (q === r) return "query_equals_response";
  if (/^(ok|yes|no|thanks|thank you)[.! ]*$/i.test(sample.response)) return "low_information_response";
  if (sample.response.length > 500_000) return "response_too_large";
  if (sample.query.length > 20_000) return "query_too_large";
  return null;
}

function isNearDuplicate(sample: TrainingSampleInput): boolean {
  const recent = listEvents(1200).filter((evt) => evt.type === "training.sample");
  const q = sample.query.toLowerCase();
  const r = sample.response.toLowerCase();
  return recent.some((evt) => {
    const p = evt.payload || {};
    return (
      String(p.query || "").toLowerCase() === q &&
      String(p.response || "").toLowerCase() === r
    );
  });
}

export function guardTrainingSample(input: TrainingSampleInput): TrainingSampleGuardResult {
  const normalized = normalizeSample(input);
  const reason = qualityReason(normalized);
  if (reason) return { accepted: false, reason, normalized };
  if (isNearDuplicate(normalized)) {
    return { accepted: false, reason: "duplicate_sample", normalized };
  }
  return { accepted: true, normalized };
}

export function recordTrainingSample(sample: TrainingSampleInput) {
  const payload = normalizeSample(sample);
  return appendEvent({
    type: "training.sample",
    timestamp: Date.now(),
    payload,
  });
}

export function recordTrainingSampleGuarded(sample: TrainingSampleInput) {
  const checked = guardTrainingSample(sample);
  if (!checked.accepted) {
    appendEvent({
      type: "training.sample.rejected",
      timestamp: Date.now(),
      payload: {
        reason: checked.reason || "rejected",
        query: checked.normalized.query.slice(0, 200),
        rating: checked.normalized.rating,
        tags: checked.normalized.tags || [],
      },
    });
    return { accepted: false, reason: checked.reason || "rejected", event: null };
  }
  return { accepted: true, reason: "", event: recordTrainingSample(checked.normalized) };
}

export function listTrainingSamples(limit = 500) {
  return listEvents(limit)
    .filter((evt) => evt.type === "training.sample")
    .map((evt) => ({ ...evt.payload, timestamp: evt.timestamp }));
}

export function exportTrainingJSONL(limit = 5000): string {
  const samples = listTrainingSamples(limit) as Array<Record<string, any>>;
  return samples
    .map((s) =>
      JSON.stringify({
        prompt: s.query,
        completion: s.response,
        rating: s.rating,
        org_id: s.orgId,
        workspace_id: s.workspaceId,
        tags: s.tags || [],
        citations: s.citations || [],
        timestamp: s.timestamp,
      })
    )
    .join("\n");
}
