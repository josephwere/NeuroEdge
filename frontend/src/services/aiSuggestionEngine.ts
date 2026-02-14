// NeuroEdge AI Suggestion Engine (frontend-side)

import { chatContext } from "./chatContext";

export interface AISuggestion {
  id: string;
  text: string;
  type: "command" | "code" | "explain" | "fix" | "continue";
  confidence: number;
}

export const generateSuggestions = async (
  input: string,
  mode: "main" | "floating"
): Promise<AISuggestion[]> => {
  if (!input.trim()) return [];

  const context = chatContext.getAll().slice(-8); // recent memory

  // Lightweight heuristic first (offline-safe)
  const suggestions: AISuggestion[] = [];

  if (input.includes("error") || input.includes("failed")) {
    suggestions.push({
      id: "fix-error",
      text: "Analyze error logs and propose a fix",
      type: "fix",
      confidence: 0.82,
    });
  }

  if (input.startsWith("git")) {
    suggestions.push({
      id: "git-help",
      text: "Explain what this Git command does",
      type: "explain",
      confidence: 0.75,
    });
  }

  if (input.endsWith("{")) {
    suggestions.push({
      id: "code-complete",
      text: "Auto-complete this code block",
      type: "code",
      confidence: 0.88,
    });
  }

  if (input.length > 20) {
    suggestions.push({
      id: "continue",
      text: "Continue intelligently",
      type: "continue",
      confidence: 0.9,
    });
  }

  return suggestions.slice(0, 3);
};
