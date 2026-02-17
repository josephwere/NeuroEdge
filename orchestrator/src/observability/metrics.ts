import { Request, Response, NextFunction } from "express";
import client from "prom-client";

client.collectDefaultMetrics({ prefix: "neuroedge_" });

const httpRequests = new client.Counter({
  name: "neuroedge_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
});

const httpLatency = new client.Histogram({
  name: "neuroedge_http_request_duration_seconds",
  help: "HTTP latency in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
});

const meshOnlineNodes = new client.Gauge({
  name: "neuroedge_mesh_nodes_online",
  help: "Number of online mesh nodes",
});

const billingTokens = new client.Counter({
  name: "neuroedge_token_usage_total",
  help: "Estimated token usage",
  labelNames: ["route", "kind"] as const,
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const seconds = Number(end - start) / 1_000_000_000;
    const route = req.route?.path || req.path || "unknown";
    const method = req.method;
    const status = String(res.statusCode);
    httpRequests.inc({ method, route, status }, 1);
    httpLatency.observe({ method, route, status }, seconds);
  });
  next();
}

export function setMeshNodesOnline(n: number) {
  meshOnlineNodes.set(Number.isFinite(n) ? n : 0);
}

export function trackTokenUsage(route: string, inputTokens: number, outputTokens: number) {
  if (inputTokens > 0) billingTokens.inc({ route, kind: "input" }, inputTokens);
  if (outputTokens > 0) billingTokens.inc({ route, kind: "output" }, outputTokens);
}

export async function renderPrometheusMetrics(): Promise<string> {
  return client.register.metrics();
}

export function getPrometheusContentType(): string {
  return client.register.contentType;
}

