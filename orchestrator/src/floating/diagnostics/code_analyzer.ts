export function analyzeCodeError(log: string) {
  if (log.includes("undefined is not a function")) {
    return {
      issue: "Runtime JS error",
      suggestion: "Check imports and object initialization"
    };
  }
}
