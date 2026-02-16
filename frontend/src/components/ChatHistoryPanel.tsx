// frontend/src/components/ChatHistoryPanel.tsx
import React, { useMemo, useState } from "react";
import { useChatHistory } from "@/services/chatHistoryStore";
import { useNotifications } from "@/services/notificationStore";
import { exportChatJSON, exportChatTXT, importChatJSON } from "@/services/chatExport";

const ChatHistoryPanel: React.FC = () => {
  const { messages, allMessages, replayMessage, resetHistory, importHistory } = useChatHistory();
  const { notifications } = useNotifications();
  const [tab, setTab] = useState<"history" | "notifications" | "approvals">("history");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const approvals = useMemo(() => {
    return allMessages.filter((m) => (m.text || "").includes("[Approval]"));
  }, [allMessages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(q));
  }, [messages, query]);

  const handleExport = (format: "json" | "txt") => {
    const url = format === "json" ? exportChatJSON(allMessages) : exportChatTXT(allMessages);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neuroedge_chat_${Date.now()}.${format === "json" ? "json" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const imported = await importChatJSON(file);
      importHistory(imported);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>NeuroEdge Archive</div>
          <h2 style={titleStyle}>History & Governance</h2>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => handleExport("json")} style={primaryActionStyle}>Export JSON</button>
          <button onClick={() => handleExport("txt")} style={secondaryActionStyle}>Export TXT</button>
          <button
            onClick={() => resetHistory()}
            style={dangerActionStyle}
          >
            Clear History
          </button>
        </div>
      </div>

      <div style={tabsStyle}>
        <button onClick={() => setTab("history")} style={tabButtonStyle(tab === "history")}>
          History
        </button>
        <button onClick={() => setTab("notifications")} style={tabButtonStyle(tab === "notifications")}>
          Notifications
        </button>
        <button onClick={() => setTab("approvals")} style={tabButtonStyle(tab === "approvals")}>
          Approvals
        </button>
        <label style={importStyle}>
          Import
          <input
            type="file"
            accept="application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {tab === "history" && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history…"
            style={searchStyle}
          />
          <div style={listStyle}>
            {filtered.length === 0 && <div style={emptyStyle}>No history yet.</div>}
            {filtered.map((log) => (
              <div key={log.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <span style={rolePillStyle(log.role)}>{log.role.toUpperCase()}</span>
                  <span style={timeStyle}>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div style={cardBodyStyle}>{log.text}</div>
                {log.role === "user" && (
                  <button onClick={() => replayMessage(log.id)} style={inlineActionStyle}>
                    Replay
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "notifications" && (
        <div style={listStyle}>
          {notifications.length === 0 && <div style={emptyStyle}>No notifications yet.</div>}
          {notifications.map((n) => (
            <div key={n.id} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span style={rolePillStyle("system")}>{(n.type || "info").toUpperCase()}</span>
                <span style={timeStyle}>Live</span>
              </div>
              <div style={cardBodyStyle}>{n.message}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "approvals" && (
        <div style={listStyle}>
          {approvals.length === 0 && <div style={emptyStyle}>No approvals yet.</div>}
          {approvals.map((log) => (
            <div key={log.id} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span style={rolePillStyle("system")}>APPROVAL</span>
                <span style={timeStyle}>{new Date(log.timestamp).toLocaleString()}</span>
              </div>
              <div style={cardBodyStyle}>{log.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  padding: "1.5rem",
  height: "100%",
  overflowY: "auto",
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  color: "#e2e8f0",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  marginBottom: "1rem",
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  fontSize: "0.65rem",
  color: "#94a3b8",
};

const titleStyle: React.CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "1.4rem",
  color: "#f8fafc",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginBottom: "1rem",
  alignItems: "center",
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.45rem 0.85rem",
  borderRadius: 999,
  border: "1px solid #1e293b",
  background: active ? "#1d4ed8" : "#0f172a",
  color: "#e2e8f0",
  cursor: "pointer",
  fontSize: "0.8rem",
});

const importStyle: React.CSSProperties = {
  marginLeft: "auto",
  border: "1px dashed #475569",
  borderRadius: 999,
  padding: "0.4rem 0.85rem",
  fontSize: "0.75rem",
  cursor: "pointer",
};

const searchStyle: React.CSSProperties = {
  width: "100%",
  marginBottom: "1rem",
  padding: "0.6rem 0.75rem",
  borderRadius: 12,
  border: "1px solid #1f2937",
  background: "#0b1220",
  color: "#e2e8f0",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const cardStyle: React.CSSProperties = {
  padding: "0.9rem",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.7)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.5rem",
};

const rolePillStyle = (role: string): React.CSSProperties => ({
  padding: "0.2rem 0.6rem",
  borderRadius: 999,
  background: role === "user" ? "#1e40af" : role === "assistant" ? "#0f766e" : "#334155",
  color: "#e2e8f0",
  fontSize: "0.65rem",
  letterSpacing: "0.08em",
});

const timeStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#94a3b8",
};

const cardBodyStyle: React.CSSProperties = {
  lineHeight: 1.5,
  color: "#e2e8f0",
  fontSize: "0.9rem",
};

const inlineActionStyle: React.CSSProperties = {
  marginTop: "0.6rem",
  border: "1px solid #1e293b",
  background: "transparent",
  color: "#e2e8f0",
  padding: "0.4rem 0.65rem",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: "0.75rem",
};

const primaryActionStyle: React.CSSProperties = {
  padding: "0.45rem 0.85rem",
  background: "#2563eb",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  borderRadius: 10,
  fontSize: "0.8rem",
};

const secondaryActionStyle: React.CSSProperties = {
  ...primaryActionStyle,
  background: "#0f172a",
  border: "1px solid #334155",
};

const dangerActionStyle: React.CSSProperties = {
  ...primaryActionStyle,
  background: "#b91c1c",
};

const emptyStyle: React.CSSProperties = {
  padding: "1rem",
  borderRadius: 12,
  border: "1px dashed #334155",
  color: "#94a3b8",
  textAlign: "center",
};

export default ChatHistoryPanel;
