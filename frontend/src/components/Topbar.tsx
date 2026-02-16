// frontend/src/components/Topbar.tsx

import React, { useEffect, useState } from "react";
import { useUI } from "@/services/uiStore";

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
  const { theme, toggleTheme, themePreference, setThemePreference } = useUI();
  const [search, setSearch] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  const runCommand = (cmd: string) => {
    onCommand(cmd);
    setShowCommands(false);
  };

  return (
    <div
      style={{
        height: "56px",
        width: "100%",
        background: "var(--ne-surface)",
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
      <button
        onClick={() => onNavigate?.("chat")}
        style={{
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--ne-text)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        NeuroEdge
      </button>

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
        onClick={() => toggleTheme()}
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
          <button
            style={userMenuItemStyle}
            onClick={() => {
              setThemePreference("system");
              setShowUserMenu(false);
            }}
          >
            Theme: System
          </button>
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
