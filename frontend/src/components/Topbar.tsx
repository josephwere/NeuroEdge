// frontend/src/components/Topbar.tsx

import React, { useEffect, useState } from "react";

interface TopbarProps {
  onSearch?: (query: string) => void;
  onCommand?: (command: string) => void;
  onToggleSidebar?: () => void;
  onNavigate?: (view: "chat" | "dashboard" | "settings" | "history" | "extensions") => void;
  onNewChat?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({
  onSearch = () => {},
  onCommand = () => {},
  onToggleSidebar,
  onNavigate,
  onNewChat,
}) => {
  const [search, setSearch] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [theme, setTheme] = useState<"light" | "dark">(
    ((localStorage.getItem("neuroedge_theme") as "light" | "dark") || "light")
  );

  /* -------------------- */
  /* Network status */
  /* -------------------- */
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("neuroedge_theme", theme);
  }, [theme]);

  const runCommand = (cmd: string) => {
    const normalized = cmd.trim().toLowerCase();
    if (normalized === "new chat") {
      onNewChat?.();
    } else if (normalized === "open settings") {
      onNavigate?.("settings");
    } else if (normalized === "toggle theme") {
      setTheme((t) => (t === "light" ? "dark" : "light"));
    } else if (normalized === "clear history") {
      localStorage.removeItem("chat_history");
      localStorage.removeItem("neuroedge_chat_context");
      localStorage.removeItem("neuroedge_cache");
      onNewChat?.();
    } else if (normalized === "neuroedge diagnostics") {
      onNavigate?.("dashboard");
    }
    onCommand(cmd);
  };

  return (
    <div
      style={{
        height: "56px",
        width: "100%",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        padding: "0 1rem",
        gap: "1rem",
        zIndex: 10,
        position: "relative",
      }}
    >
      {/* NeuroEdge Identity */}
      <button title="Toggle sidebar" style={iconButton} onClick={onToggleSidebar}>
        ☰
      </button>
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "#1f2937",
        }}
      >
        NeuroEdge
      </div>

      {/* Offline indicator */}
      {isOffline && (
        <span
          style={{
            padding: "0.2rem 0.5rem",
            background: "#f87171",
            color: "#fff",
            borderRadius: "6px",
            fontSize: "0.75rem",
          }}
        >
          Offline
        </span>
      )}

      {/* Global Search */}
      <div style={{ flex: 1, position: "relative" }}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onSearch(e.target.value);
          }}
          placeholder="Search chats, messages, commands…"
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            outline: "none",
            fontSize: "0.85rem",
          }}
        />
      </div>

      {/* Command Palette Trigger */}
      <button
        onClick={() => setShowCommands(true)}
        title="Command Palette (Ctrl + K)"
        style={iconButton}
      >
        ⌘
      </button>

      {/* Notifications */}
      <button
        title="Notifications"
        style={iconButton}
        onClick={() => onNavigate?.("history")}
      >
        🔔
      </button>

      {/* Theme Toggle */}
      <button
        title="Toggle theme"
        style={iconButton}
        onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>

      {/* Floating Chat Toggle */}
      <button
        title="Toggle floating chat"
        style={iconButton}
        onClick={() =>
          window.dispatchEvent(new CustomEvent("neuroedge:toggleFloating"))
        }
      >
        🪟
      </button>

      {/* User Menu */}
      <button title="User menu" style={iconButton} onClick={() => setShowUserMenu((v) => !v)}>
        👤
      </button>

      {showUserMenu && (
        <div style={userMenuStyle}>
          <button style={userMenuItemStyle} onClick={() => { onNavigate?.("settings"); setShowUserMenu(false); }}>
            Profile Settings
          </button>
          <button style={userMenuItemStyle} onClick={() => { onNavigate?.("history"); setShowUserMenu(false); }}>
            Notifications & History
          </button>
          <button style={userMenuItemStyle} onClick={() => { onNavigate?.("extensions"); setShowUserMenu(false); }}>
            Extensions
          </button>
          <button style={userMenuItemStyle} onClick={() => { onNewChat?.(); setShowUserMenu(false); }}>
            New Chat
          </button>
        </div>
      )}

      {/* Command Palette Overlay */}
      {showCommands && (
        <CommandPalette
          onClose={() => setShowCommands(false)}
          onSelect={runCommand}
        />
      )}
    </div>
  );
};

export default Topbar;

/* -------------------- */
/* Command Palette */
/* -------------------- */

interface CommandPaletteProps {
  onClose: () => void;
  onSelect: (cmd: string) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  onClose,
  onSelect,
}) => {
  const commands = [
    "New Chat",
    "Open Settings",
    "Toggle Theme",
    "Export Chat",
    "Clear History",
    "NeuroEdge Diagnostics",
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "420px",
          background: "#ffffff",
          borderRadius: "12px",
          padding: "0.5rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        }}
      >
        {commands.map((cmd) => (
          <div
            key={cmd}
            onClick={() => {
              onSelect(cmd);
              onClose();
            }}
            style={{
              padding: "0.6rem 0.75rem",
              cursor: "pointer",
              borderRadius: "8px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#f3f4f6")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {cmd}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------- */
/* Styles */
/* -------------------- */

const iconButton: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: "1.1rem",
};

const userMenuStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  top: 54,
  zIndex: 50,
  minWidth: 180,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const userMenuItemStyle: React.CSSProperties = {
  textAlign: "left",
  border: "none",
  background: "#fff",
  color: "#111827",
  borderRadius: 8,
  padding: "0.45rem 0.55rem",
  cursor: "pointer",
  fontSize: "0.82rem",
};
