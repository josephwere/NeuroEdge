// frontend/src/components/ChatHistory.tsx

import React, { useEffect, useState } from "react";
import ChatSearchBar from "@/components/ChatSearchBar";
import ChatHistoryItem from "@/components/ChatHistoryItem";
import { ChatHistoryStore, ChatRecord } from "@/services/chatHistoryStore";
import { confirmSafeAction } from "@/services/safetyPrompts";

const ChatHistory: React.FC = () => {
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [filtered, setFiltered] = useState<ChatRecord[]>([]);

  useEffect(() => {
    const data = ChatHistoryStore.getAll();
    setRecords(data);
    setFiltered(data);
  }, []);

  const handleSearch = (q: string) => {
    setFiltered(q ? ChatHistoryStore.search(q) : records);
  };

  const handleDelete = (id: string) => {
    if (!confirmSafeAction({ title: "history record", actionLabel: "delete", chatMode: true })) return;
    ChatHistoryStore.remove(id);
    const updated = ChatHistoryStore.getAll();
    setRecords(updated);
    setFiltered(updated);
  };

  const handleReplay = (record: ChatRecord) => {
    alert(`Replay triggered for: ${record.title}`);
    // Hook into orchestrator later
  };

  return (
    <div style={{ padding: "1rem", height: "100%", overflowY: "auto", background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)", color: "#e2e8f0" }}>
      <ChatSearchBar onSearch={handleSearch} />

      {filtered.length === 0 && (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
          No memory found.
        </div>
      )}

      {filtered.map((r) => (
        <ChatHistoryItem
          key={r.id}
          record={r}
          onDelete={handleDelete}
          onReplay={handleReplay}
        />
      ))}
    </div>
  );
};

export default ChatHistory;
