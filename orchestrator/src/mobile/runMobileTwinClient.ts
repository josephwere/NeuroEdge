import { MobileTwinClient } from "./mobileTwinClient";
import { defaultActionHandlers } from "./defaultActionHandlers";

function required(name: string, fallback = ""): string {
  const v = String(process.env[name] || fallback).trim();
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

async function main(): Promise<void> {
  const client = new MobileTwinClient(
    {
      baseUrl: required("MOBILE_TWIN_ORCHESTRATOR_URL", "http://localhost:7070"),
      headers: {
        apiKey: String(process.env.MOBILE_TWIN_API_KEY || process.env.KERNEL_API_KEY || "").trim() || undefined,
        orgId: String(process.env.MOBILE_TWIN_ORG_ID || "personal"),
        workspaceId: String(process.env.MOBILE_TWIN_WORKSPACE_ID || "default"),
        role: String(process.env.MOBILE_TWIN_ROLE || "user"),
        userEmail: String(process.env.MOBILE_TWIN_USER_EMAIL || "mobile@local"),
        userName: String(process.env.MOBILE_TWIN_USER_NAME || "Mobile User"),
        bearerToken: String(process.env.MOBILE_TWIN_BEARER_TOKEN || "").trim() || undefined,
      },
      pollIntervalMs: Number(process.env.MOBILE_TWIN_POLL_INTERVAL_MS || 3000),
      requestTimeoutMs: Number(process.env.MOBILE_TWIN_TIMEOUT_MS || 15000),
      device: {
        id: required("MOBILE_TWIN_DEVICE_ID", "mobile-dev-1"),
        platform: (String(process.env.MOBILE_TWIN_PLATFORM || "android").toLowerCase() === "ios" ? "ios" : "android"),
        deviceName: String(process.env.MOBILE_TWIN_DEVICE_NAME || "NeuroEdge Mobile"),
        appVersion: String(process.env.MOBILE_TWIN_APP_VERSION || "1.0.0"),
        osVersion: String(process.env.MOBILE_TWIN_OS_VERSION || "unknown"),
        pushToken: String(process.env.MOBILE_TWIN_PUSH_TOKEN || ""),
        attestationProvider: String(process.env.MOBILE_TWIN_ATTEST_PROVIDER || ""),
        attestationStatus: (String(process.env.MOBILE_TWIN_ATTEST_STATUS || "trusted").toLowerCase() === "trusted"
          ? "trusted"
          : "unknown"),
      },
    },
    defaultActionHandlers
  );

  await client.start();
  // Keep process alive
  process.stdout.write(
    `[mobile-twin] started device=${process.env.MOBILE_TWIN_DEVICE_ID || "mobile-dev-1"} poll=${process.env.MOBILE_TWIN_POLL_INTERVAL_MS || "3000"}ms\n`
  );

  const shutdown = () => {
    client.stop();
    process.stdout.write("[mobile-twin] stopped\n");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[mobile-twin] fatal: ${err?.message || String(err)}\n`);
  process.exit(1);
});
