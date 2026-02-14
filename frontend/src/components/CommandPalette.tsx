// frontend/src/components/CommandPalette.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChatHistory } from "@/services/chatHistoryStore";
import { OrchestratorClient } from "@/services/orchestrator_client";

/**
 * NeuroEdge Quick Command Palette
 * - Open with Ctrl+K / Cmd+K
 * - Search past commands & orchestrator commands
 * - Replay or export commands
 * - Works with FloatingChat & MainChat
 */

interface CommandPaletteProps {
  orchestrator: OrchestratorClient;
  visible: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  orchestrator,
  visible,
  onClose,
}) => {
  const { history } = useChatHistory();
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState(history);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  // Filter commands in real-time
  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(
      history.filter(h => h.text.toLowerCase().includes(q) && h.text.startsWith("💻"))
    );
    setSelectedIndex(0);
  }, [query, history]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIndex] && replayCommand(filtered[selectedIndex].text);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, filtered, selectedIndex]);

  // Execute command via orchestrator
  const replayCommand = useCallback(
    (cmd: string) => {
      orchestrator.execute({ command: cmd, context: history });
      onClose();
    },
    [orchestrator, history, onClose]
  );

  // Export command as .txt
  const exportCommand = (cmd: string) => {
    const blob = new Blob([cmd], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `command_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!visible) return null;

  return (
    <div style={paletteOverlay}>
      <div onClick={e => e.stopPropagation()} style={paletteStyle}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search commands or past logs…"
          style={inputStyle}
        />

        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: "1rem", opacity: 0.6 }}>
              No matching commands
            </div>
          )}

          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              style={{
                ...itemStyle,
                background: idx === selectedIndex ? "#2b2b45" : "transparent",
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => replayCommand(cmd.text)}
            >
              <span>{cmd.text}</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => replayCommand(cmd.text)} style={buttonStyle}>
                  ▶ Replay
                </button>
                <button onClick={() => exportCommand(cmd.text)} style={buttonStyle}>
                  💾 Export
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

/* -------------------- Styles -------------------- */

const paletteOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 99999,
};

const paletteStyle: React.CSSProperties = {
  width: "500px",
  maxHeight: "60%",
  background: "#1e1e2f",
  color: "#fff",
  borderRadius: "8px",
  boxShadow: "0 0 30px rgba(0,0,0,0.7)",
  display: "flex",
  flexDirection: "column",
};

const inputStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  border: "none",
  outline: "none",
  fontSize: "1rem",
  background: "#2b2b3c",
  borderTopLeftRadius: "8px",
  borderTopRightRadius: "8px",
};

const itemStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  borderBottom: "1px solid #2b2b3c",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  fontFamily: "monospace",
};

const buttonStyle: React.CSSProperties = {
  background: "#3a3aff",
  border: "none",
  color: "#fff",
  padding: "0.25rem 0.5rem",
  borderRadius: "4px",
  cursor: "pointer",
};
