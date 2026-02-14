// frontend/src/components/ChatHistoryPanel.tsx
import React from "react";
import { useChatHistory } from "@/services/chatHistoryStore";

const ChatHistoryPanel: React.FC = () => {
  const { logs, replayCommand, exportLogs } = useChatHistory();

  return (
    <div style={{ padding: "1rem", height: "100%", overflowY: "auto", background: "#1f1f2f", color: "#fff", fontFamily: "monospace" }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={() => exportLogs("json")} style={exportButtonStyle}>Export JSON</button>
        <button onClick={() => exportLogs("md")} style={exportButtonStyle}>Export Markdown</button>
        <button onClick={() => exportLogs("csv")} style={exportButtonStyle}>Export CSV</button>
      </div>

      {logs.map(log => (
        <div key={log.id} style={{ marginBottom: "0.5rem", borderBottom: "1px solid #333", paddingBottom: "0.25rem" }}>
          <div>
            <strong>{log.role}</strong> [{new Date(log.timestamp).toLocaleTimeString()}]:
          </div>
          <div>{log.text}</div>
          {log.role === "user" && (
            <button onClick={() => replayCommand(log.id)} style={{ ...exportButtonStyle, marginTop: "2px" }}>↻ Replay</button>
          )}
        </div>
      ))}
    </div>
  );
};

const exportButtonStyle: React.CSSProperties = {
  padding: "0.25rem 0.5rem",
  background: "#3a3aff",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  borderRadius: 4,
  fontSize: "0.8rem",
};

export default ChatHistoryPanel;
