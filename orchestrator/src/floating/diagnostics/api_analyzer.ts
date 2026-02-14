export function analyzeAPIError(log: string) {
  if (log.includes("ECONNREFUSED")) {
    return {
      issue: "Backend service down",
      suggestion: "Check server or Docker container",
    };
  }

  if (log.includes("401") || log.includes("403")) {
    return {
      issue: "Authentication failure",
      suggestion: "Check API keys or auth middleware",
    };
  }
}
