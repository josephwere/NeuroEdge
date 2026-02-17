// floating_chat/analytics/content_analysis.ts
export function analyzeContent(content: string) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const risky = ["delete", "drop", "rm -rf", "shutdown", "disable auth", "bypass"];
  const positive = ["great", "success", "thanks", "resolved", "fixed"];
  const negative = ["error", "failed", "broken", "issue", "urgent", "problem"];

  const riskHits = risky.filter((k) => lower.includes(k)).length;
  const posHits = positive.filter((k) => lower.includes(k)).length;
  const negHits = negative.filter((k) => lower.includes(k)).length;
  const sentiment = posHits > negHits ? "positive" : negHits > posHits ? "negative" : "neutral";
  const intent =
    /research|search|trending|latest/.test(lower) ? "research" :
    /test|build|compile|debug|fix/.test(lower) ? "engineering" :
    /plan|roadmap|strategy/.test(lower) ? "planning" :
    "general";

  return {
    summary: text.length > 120 ? `${text.slice(0, 120)}...` : text,
    sentiment,
    intent,
    riskScore: Math.min(1, riskHits * 0.3),
    wordCount: words.length,
  };
}
