export function analyzeBuildLog(log: string) {
  if (log.includes("MODULE_NOT_FOUND")) {
    return {
      issue: "Dependency missing",
      suggestion: "Run npm install or yarn install",
      severity: "high"
    };
  }

  if (log.includes("Out of memory")) {
    return {
      issue: "Memory exhaustion",
      suggestion: "Increase Node.js memory or optimize build",
      severity: "critical"
    };
  }

  return { issue: "Unknown", severity: "low" };
}
