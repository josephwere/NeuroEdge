// frontend/src/components/ChatHistoryItem.tsx

import React from "react";
import { ChatRecord } from "@/services/chatHistoryStore";

interface Props {
  record: ChatRecord;
  onReplay: (r: ChatRecord) => void;
  onDelete: (id: string) => void;
}

const ChatHistoryItem: React.FC<Props> = ({ record, onReplay, onDelete }) => {
  return (
    <div
      style={{
        padding: "0.6rem",
        borderRadius: "10px",
        background: "rgba(15, 23, 42, 0.7)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        marginBottom: "0.5rem",
        color: "#e2e8f0",
      }}
    >
      <strong>{record.title}</strong>
      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
        {new Date(record.createdAt).toLocaleString()}
      </div>

      <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={() => onReplay(record)} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer" }}>
          ▶ Replay
        </button>
        <button onClick={() => onDelete(record.id)} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer" }}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
};

export default ChatHistoryItem;
