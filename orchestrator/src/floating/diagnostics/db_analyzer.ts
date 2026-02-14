export function analyzeDB(log: string) {
  if (log.includes("ECONNRESET")) {
    return {
      issue: "DB connection dropped",
      suggestion: "Verify DB host, port, SSL settings"
    };
  }

  if (log.includes("relation does not exist")) {
    return {
      issue: "Missing table",
      suggestion: "Run migrations"
    };
  }
}
