import React, { useEffect, useState } from "react";

/* ===============================
   NeuroEdge Suggestion Contract
   =============================== */

export interface AISuggestion {
  id: string;
  text: string;
  type: "command" | "code" | "fix" | "explain" | "continue";
  confidence?: number;
  action?: () => void;
}

interface Props {
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
}

/* ===============================
   AI Suggestions Overlay
   =============================== */

const AISuggestionsOverlay: React.FC<Props> = ({ suggestions, onAccept }) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [suggestions]);

  useEffect(() => {
    if (!suggestions.length) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(prev => (prev + 1) % suggestions.length);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const s = suggestions[selected];
        s?.action?.();
        onAccept(s);
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onAccept(null as any); // parent clears suggestions
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const s = suggestions[0];
        s?.action?.();
        onAccept(s);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [suggestions, selected, onAccept]);

  if (!suggestions.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "64px",
        left: "12px",
        maxWidth: "92%",
        background: "#1e1e2f",
        borderRadius: "10px",
        padding: "6px",
        boxShadow: "0 0 22px rgba(0,0,0,0.6)",
        zIndex: 10000,
        fontFamily: "monospace",
      }}
    >
      {suggestions.map((s, i) => (
        <div
          key={s.id}
          onClick={() => {
            s.action?.();
            onAccept(s);
          }}
          style={{
            padding: "8px 10px",
            marginBottom: "2px",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: i === selected ? "#2f2fff" : "transparent",
            color: i === selected ? "#fff" : "#eaeaf0",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={() => setSelected(i)}
        >
          <span>{s.text}</span>

          <span style={{ opacity: 0.55, fontSize: "0.75rem" }}>
            {s.type}
            {s.confidence !== undefined
              ? ` • ${Math.round(s.confidence * 100)}%`
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AISuggestionsOverlay;
