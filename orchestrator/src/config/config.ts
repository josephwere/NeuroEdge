// orchestrator/src/config/config.ts
export interface OrchestratorConfig {
  port: number;
  kernelUrl: string;
  mlUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(): OrchestratorConfig {
  return {
    port: Number(process.env.PORT) || 7070,
    kernelUrl: process.env.KERNEL_URL || "http://localhost:8080",
    mlUrl: process.env.ML_URL || "http://localhost:8090",
    logLevel: (process.env.LOG_LEVEL as any) || "info"
  };
}
