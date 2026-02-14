export function analyzeLog(log: string): string | null {
  if (log.includes("Module not found")) {
    return "Missing dependency detected. Suggest running npm install.";
  }

  if (log.includes("ECONNREFUSED")) {
    return "Backend service not reachable. Check API or database connection.";
  }

  if (log.includes("SyntaxError")) {
    return "Syntax error detected. Check recent code changes.";
  }

  return null;
}
