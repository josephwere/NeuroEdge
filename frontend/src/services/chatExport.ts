// frontend/src/services/chatExport.ts

import { ChatMessage } from "@/services/chatHistoryStore";

/**
 * Export chat logs in JSON (full fidelity)
 */
export const exportChatJSON = (messages: ChatMessage[]) => {
  const dataStr = JSON.stringify(messages, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  return url;
};

/**
 * Export chat logs as human-readable TXT / Markdown
 */
export const exportChatTXT = (messages: ChatMessage[]) => {
  const content = messages
    .map(msg => `[${new Date(msg.timestamp).toLocaleString()}] ${msg.role.toUpperCase()}: ${msg.text}`)
    .join("\n\n");

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  return url;
};

/**
 * Import chat logs from JSON
 */
export const importChatJSON = async (file: File): Promise<ChatMessage[]> => {
  const text = await file.text();
  const data: ChatMessage[] = JSON.parse(text);
  // Validate minimal structure
  if (!Array.isArray(data)) throw new Error("Invalid chat log");
  return data.map(msg => ({
    id: String(msg.id || Math.random()),
    role: (msg.role as ChatMessage["role"]) || "assistant",
    text: String(msg.text || ""),
    timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
    type: msg.type,
    isCode: msg.isCode,
    codeLanguage: msg.codeLanguage,
    collapsible: msg.collapsible,
    collapsibleOpen: msg.collapsibleOpen,
    tags: msg.tags,
  }));
};
