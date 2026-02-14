export class MathReasoningAgent {
  solve(expression: string): number {
    try {
      // Safe math evaluation (basic)
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        throw new Error("Unsafe expression");
      }
      return Function(`return (${expression})`)();
    } catch {
      throw new Error("Failed to evaluate expression");
    }
  }
}
