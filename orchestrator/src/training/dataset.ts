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

export function recordTrainingSample(sample: TrainingSampleInput) {
  const payload = {
    query: String(sample.query || "").trim(),
    response: String(sample.response || "").trim(),
    rating: sample.rating || "neutral",
    orgId: sample.orgId || "personal",
    workspaceId: sample.workspaceId || "default",
    actor: sample.actor || "unknown",
    tags: Array.isArray(sample.tags) ? sample.tags : [],
    citations: Array.isArray(sample.citations) ? sample.citations : [],
  };
  return appendEvent({
    type: "training.sample",
    timestamp: Date.now(),
    payload,
  });
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
