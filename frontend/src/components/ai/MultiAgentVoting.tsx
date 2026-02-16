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
            padding: "0.6rem",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "10px",
            background: "rgba(15, 23, 42, 0.7)",
            color: "#e2e8f0",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(37, 99, 235, 0.18)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(15, 23, 42, 0.7)")}
        >
          <strong style={{ width: "60px" }}>{s.agent}</strong>
          <div style={{ flex: 1 }}>{s.text}</div>
          <div
            style={{
              width: "100px",
              height: "8px",
              background: "rgba(148, 163, 184, 0.25)",
              borderRadius: "4px",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${s.confidence}%`,
                height: "100%",
                background: "#2563eb",
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
              background: "#2563eb",
              color: "#fff",
              transition: "background 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
            onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}
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
