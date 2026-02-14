// frontend/src/components/MultiAgentVoting.tsx
import React from "react";

export interface Suggestion {
  agent: string;
  text: string;
  confidence: number; // 0-100%
}

interface Props {
  suggestions: Suggestion[];
  onVote?: (agent: string) => void;
}

const MultiAgentVoting: React.FC<Props> = ({ suggestions, onVote }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {suggestions.map((s, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem",
            border: "1px solid #ccc",
            borderRadius: "6px",
            background: "#f9f9f9",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f0f0ff")}
          onMouseLeave={e => (e.currentTarget.style.background = "#f9f9f9")}
        >
          <strong style={{ width: "60px" }}>{s.agent}</strong>
          <div style={{ flex: 1 }}>{s.text}</div>
          <div
            style={{
              width: "100px",
              height: "8px",
              background: "#e5e7eb",
              borderRadius: "4px",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${s.confidence}%`,
                height: "100%",
                background: "#3a3aff",
                transition: "width 0.3s",
              }}
            />
          </div>
          <button
            style={{
              marginLeft: "0.5rem",
              padding: "0.25rem 0.5rem",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              background: "#3a3aff",
              color: "#fff",
              transition: "background 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#1a1aff")}
            onMouseLeave={e => (e.currentTarget.style.background = "#3a3aff")}
            onClick={() => onVote?.(s.agent)}
          >
            Vote
          </button>
        </div>
      ))}
    </div>
  );
};

export default MultiAgentVoting;
