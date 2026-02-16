// frontend/src/components/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { chatContext } from "@/services/chatContext";

/**
 * NeuroEdge Dashboard
 * Real-time analytics, approvals, AI suggestions
 */

interface MessageStats {
  total: number;
  errors: number;
  warnings: number;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
}

interface AISuggestion {
  id: string;
  suggestion: string;
}

const Dashboard: React.FC = () => {
  const [messages, setMessages] = useState<MessageStats>({ total: 0, errors: 0, warnings: 0 });
  const [approvals, setApprovals] = useState<ApprovalStats>({ pending: 0, approved: 0, rejected: 0 });
  const [aiSuggestions, setAISuggestions] = useState<AISuggestion[]>([]);

  /* ---------------- Fetch Stats ---------------- */
  useEffect(() => {
    const allMessages = chatContext.getAll();

    // Messages / Commands
    const total = allMessages.length;
    const errors = allMessages.filter(m => m.role === "assistant" && m.content.startsWith("❌")).length;
    const warnings = allMessages.filter(m => m.role === "assistant" && m.content.startsWith("⚠️")).length;
    setMessages({ total, errors, warnings });

    // Approvals
    const pending = allMessages.filter(m => m.content.includes("[Approval]")).length;
    const approved = allMessages.filter(m => m.content.includes("✅ Approved")).length;
    const rejected = allMessages.filter(m => m.content.includes("❌ Rejected")).length;
    setApprovals({ pending, approved, rejected });

    // AI Suggestions
    const suggestions = allMessages
      .filter(m => m.content.startsWith("🧠 Suggestion"))
      .map((m, idx) => ({ id: idx.toString(), suggestion: m.content }));
    setAISuggestions(suggestions);

  }, []);

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%", background: "#f5f6fa" }}>
      <h2>📊 NeuroEdge Dashboard</h2>

      {/* Messages Stats */}
      <div style={widgetStyle}>
        <h3>Messages / Commands</h3>
        <p>Total Messages: {messages.total}</p>
        <p style={{ color: "#ff4d4f" }}>Errors: {messages.errors}</p>
        <p style={{ color: "#faad14" }}>Warnings: {messages.warnings}</p>
      </div>

      {/* Approvals */}
      <div style={widgetStyle}>
        <h3>Approvals</h3>
        <p>Pending: {approvals.pending}</p>
        <p style={{ color: "#36cfc9" }}>Approved: {approvals.approved}</p>
        <p style={{ color: "#ff4d4f" }}>Rejected: {approvals.rejected}</p>
      </div>

      {/* AI Suggestions */}
      <div style={widgetStyle}>
        <h3>🤖 AI Suggestions</h3>
        {aiSuggestions.length === 0 ? (
          <p>No suggestions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {aiSuggestions.map(s => (
              <button
                key={s.id}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  background: "#2b2b3c",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => console.log("AI suggestion applied:", s.suggestion)}
              >
                {s.suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------- */
/* Widget Styles */
/* -------------------- */
const widgetStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "1rem",
  borderRadius: "8px",
  background: "#fff",
  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
};

export default Dashboard;
