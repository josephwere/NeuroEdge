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
        background: "#f9fafb",
        marginBottom: "0.5rem",
      }}
    >
      <strong>{record.title}</strong>
      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
        {new Date(record.createdAt).toLocaleString()}
      </div>

      <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={() => onReplay(record)}>▶ Replay</button>
        <button onClick={() => onDelete(record.id)}>🗑 Delete</button>
      </div>
    </div>
  );
};

export default ChatHistoryItem;
