// frontend/src/components/ChatSearchBar.tsx
import React, { useState, useEffect } from "react";

export interface ChatFilters {
  type?: "user" | "assistant" | "system" | "info" | "ml" | "error" | "warn";
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  tags?: string[];
}

interface ChatSearchBarProps {
  onSearch: (query: string, filters: ChatFilters) => void;
}

const ChatSearchBar: React.FC<ChatSearchBarProps> = ({ onSearch }) => {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ChatFilters["type"]>();
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();
  const [tags, setTags] = useState<string>(""); // comma-separated tags

  const handleSearch = () => {
    const tagsArray = tags.split(",").map(t => t.trim()).filter(Boolean);
    onSearch(query, { type: typeFilter, startDate, endDate, tags: tagsArray.length ? tagsArray : undefined });
  };

  useEffect(() => {
    const timer = setTimeout(() => handleSearch(), 400); // debounced search
    return () => clearTimeout(timer);
  }, [query, typeFilter, startDate, endDate, tags]);

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5rem",
      padding: "0.5rem",
      background: "#2b2b3c",
      color: "#fff",
      borderBottom: "1px solid #444"
    }}>
      {/* Search Query */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search chats or commands..."
        style={{
          flex: 1,
          minWidth: "150px",
          padding: "0.5rem",
          borderRadius: "4px",
          border: "none",
          background: "#1e1e2f",
          color: "#fff"
        }}
      />

      {/* Type Filter */}
      <select
        value={typeFilter || ""}
        onChange={e => setTypeFilter(e.target.value as ChatFilters["type"] || undefined)}
        style={{
          padding: "0.5rem",
          borderRadius: "4px",
          border: "none",
          background: "#1e1e2f",
          color: "#fff"
        }}
      >
        <option value="">All Types</option>
        <option value="user">User</option>
        <option value="assistant">Assistant</option>
        <option value="system">System</option>
        <option value="info">Info</option>
        <option value="ml">ML</option>
        <option value="warn">Warning</option>
        <option value="error">Error</option>
      </select>

      {/* Date Filters */}
      <input
        type="date"
        value={startDate || ""}
        onChange={e => setStartDate(e.target.value)}
        style={{ padding: "0.5rem", borderRadius: "4px", border: "none", background: "#1e1e2f", color: "#fff" }}
      />
      <input
        type="date"
        value={endDate || ""}
        onChange={e => setEndDate(e.target.value)}
        style={{ padding: "0.5rem", borderRadius: "4px", border: "none", background: "#1e1e2f", color: "#fff" }}
      />

      {/* Tags */}
      <input
        type="text"
        value={tags}
        onChange={e => setTags(e.target.value)}
        placeholder="Tags (comma-separated)"
        style={{ padding: "0.5rem", borderRadius: "4px", border: "none", background: "#1e1e2f", color: "#fff", minWidth: "120px" }}
      />
    </div>
  );
};

export default ChatSearchBar;
