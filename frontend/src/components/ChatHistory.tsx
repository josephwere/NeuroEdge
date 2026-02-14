// frontend/src/components/ChatHistory.tsx

import React, { useEffect, useState } from "react";
import ChatSearchBar from "@/components/ChatSearchBar";
import ChatHistoryItem from "@/components/ChatHistoryItem";
import { ChatHistoryStore, ChatRecord } from "@/services/chatHistoryStore";

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
    <div style={{ padding: "1rem", height: "100%", overflowY: "auto" }}>
      <ChatSearchBar onSearch={handleSearch} />

      {filtered.length === 0 && (
        <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
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
