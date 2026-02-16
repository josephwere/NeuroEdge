// orchestrator/src/config/config.ts
export interface OrchestratorConfig {
  port: number;
  kernelUrl: string;
  mlUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
  localOnly: boolean;
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function assertLocalServiceUrl(name: string, rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${name} is not a valid URL: ${rawUrl}`);
  }

  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (!localHosts.has(host)) {
    throw new Error(`${name} must point to a local address in local-only mode. Got: ${rawUrl}`);
  }
}

export function loadConfig(): OrchestratorConfig {
  const kernelUrl = process.env.KERNEL_URL || "http://localhost:8080";
  const mlUrl = process.env.ML_URL || "http://localhost:8090";
  const localOnly = parseBool(process.env.NEUROEDGE_LOCAL_ONLY, true);

  if (localOnly) {
    assertLocalServiceUrl("KERNEL_URL", kernelUrl);
    assertLocalServiceUrl("ML_URL", mlUrl);
  }

  return {
    port: Number(process.env.PORT) || 7070,
    kernelUrl,
    mlUrl,
    logLevel: (process.env.LOG_LEVEL as any) || "info",
    localOnly,
  };
}
