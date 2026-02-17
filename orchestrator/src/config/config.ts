// orchestrator/src/config/config.ts
export interface OrchestratorConfig {
  port: number;
  kernelUrl: string;
  mlUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
  localOnly: boolean;
  authRequired: boolean;
  authzEnforceScopes: boolean;
  authzRequireWorkspace: boolean;
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
  const authRequired = parseBool(process.env.AUTH_REQUIRED, true);
  const authzEnforceScopes = parseBool(process.env.AUTHZ_ENFORCE_SCOPES, true);
  const authzRequireWorkspace = parseBool(process.env.AUTHZ_REQUIRE_WORKSPACE, true);

  if (authRequired) {
    const hasJwtKey = Boolean((process.env.JWT_SECRET || "").trim()) || Boolean((process.env.JWT_PUBLIC_KEY || "").trim());
    if (!hasJwtKey) {
      throw new Error("AUTH_REQUIRED=true but neither JWT_SECRET nor JWT_PUBLIC_KEY is configured.");
    }
    if (!(process.env.JWT_ISSUER || "").trim()) {
      throw new Error("AUTH_REQUIRED=true requires JWT_ISSUER.");
    }
    if (!(process.env.JWT_AUDIENCE || "").trim()) {
      throw new Error("AUTH_REQUIRED=true requires JWT_AUDIENCE.");
    }
  }

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
    authRequired,
    authzEnforceScopes,
    authzRequireWorkspace,
  };
}
