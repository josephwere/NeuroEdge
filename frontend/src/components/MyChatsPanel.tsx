import React, { useEffect, useMemo, useState } from "react";
import {
  ConversationThread,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  renameConversation,
} from "@/services/conversationStore";
import { confirmSafeAction, recoveryGuidance } from "@/services/safetyPrompts";

const MyChatsPanel: React.FC = () => {
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = () => {
    setThreads(listConversations());
    setActiveId(getActiveConversationId());
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("neuroedge:conversationsUpdated", onUpdate as EventListener);
    window.addEventListener(
      "neuroedge:activeConversationChanged",
      onUpdate as EventListener
    );
    return () => {
      window.removeEventListener(
        "neuroedge:conversationsUpdated",
        onUpdate as EventListener
      );
      window.removeEventListener(
        "neuroedge:activeConversationChanged",
        onUpdate as EventListener
      );
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const textBlob = t.messages.map((m) => m.text).join(" ").toLowerCase();
      return t.title.toLowerCase().includes(q) || textBlob.includes(q);
    });
  }, [threads, query]);

  const openThread = (id: string) => {
    window.dispatchEvent(new CustomEvent("neuroedge:openConversation", { detail: { id } }));
    window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "chat" }));
  };

  const onRename = (thread: ConversationThread) => {
    const next = window.prompt("Rename this chat", thread.title);
    if (next === null) return;
    renameConversation(thread.id, next);
    refresh();
  };

  const onDelete = (thread: ConversationThread) => {
    if (!confirmSafeAction({ title: thread.title, actionLabel: "delete conversation" })) return;
    deleteConversation(thread.id);
    window.alert(recoveryGuidance("Conversation"));
    refresh();
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Premium Workspace</div>
          <h2 style={titleStyle}>My Chats</h2>
        </div>
        <button
          style={primaryBtn}
          onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:newChat"))}
        >
          + Start New Chat
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all chats, even older conversations..."
        style={searchStyle}
      />

      <div style={listStyle}>
        {filtered.length === 0 && (
          <div style={emptyStyle}>
            No chats found. Start a new one and it will appear here.
          </div>
        )}
        {filtered.map((thread) => {
          const preview = thread.messages[thread.messages.length - 1]?.text || "No messages yet.";
          const messageCount = thread.messages.length;
          const isActive = activeId === thread.id;
          return (
            <div key={thread.id} style={cardStyle(isActive)}>
              <div style={cardTopStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={cardTitleStyle}>{thread.title}</div>
                  <div style={metaStyle}>
                    {messageCount} msgs • Updated {new Date(thread.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button style={chipBtn} onClick={() => onRename(thread)}>
                    Rename
                  </button>
                  <button style={dangerChipBtn} onClick={() => onDelete(thread)}>
                    Delete
                  </button>
                </div>
              </div>
              <div style={previewStyle}>{preview}</div>
              <div style={{ marginTop: "0.7rem", display: "flex", justifyContent: "flex-end" }}>
                <button style={secondaryBtn} onClick={() => openThread(thread.id)}>
                  Open & Continue
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  padding: "1.2rem 1.4rem",
  height: "100%",
  overflowY: "auto",
  background:
    "radial-gradient(circle at 12% -20%, rgba(37,99,235,0.22), transparent 45%), linear-gradient(180deg,#0f172a,#0b1220)",
  color: "#e2e8f0",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  marginBottom: "1rem",
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#94a3b8",
};
const titleStyle: React.CSSProperties = {
  margin: "0.2rem 0 0",
  fontSize: "1.45rem",
};
const searchStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.8rem",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.74)",
  color: "#e2e8f0",
  marginBottom: "1rem",
};
const listStyle: React.CSSProperties = { display: "grid", gap: "0.7rem" };
const cardStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(30,58,138,0.4)" : "rgba(15,23,42,0.7)",
  border: active
    ? "1px solid rgba(96,165,250,0.65)"
    : "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  padding: "0.85rem 0.9rem",
  boxShadow: "0 10px 26px rgba(2,6,23,0.4)",
});
const cardTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.65rem",
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: "0.98rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const metaStyle: React.CSSProperties = { fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.2rem" };
const previewStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  color: "#cbd5e1",
  lineHeight: 1.5,
  fontSize: "0.86rem",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "#2563eb",
  color: "#fff",
  padding: "0.5rem 0.8rem",
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
  background: "transparent",
  color: "#e2e8f0",
  padding: "0.4rem 0.65rem",
  cursor: "pointer",
  fontSize: "0.78rem",
};
const chipBtn: React.CSSProperties = {
  ...secondaryBtn,
  padding: "0.2rem 0.48rem",
  fontSize: "0.72rem",
};
const dangerChipBtn: React.CSSProperties = {
  ...chipBtn,
  border: "1px solid rgba(248,113,113,0.5)",
  color: "#fecaca",
};
const emptyStyle: React.CSSProperties = {
  border: "1px dashed rgba(148,163,184,0.45)",
  borderRadius: 12,
  padding: "1rem",
  textAlign: "center",
  color: "#94a3b8",
};

export default MyChatsPanel;
