// frontend/src/components/dashboard/LiveDiff.tsx
import React, { useState } from "react";

interface Hunk {
  original: string;
  modified: string;
}

interface LiveDiffProps {
  hunks: Hunk[];
  onApplyChange?: (index: number) => void;
}

const LiveDiff: React.FC<LiveDiffProps> = ({ hunks, onApplyChange }) => {
  const [applied, setApplied] = useState<boolean[]>(hunks.map(() => false));

  const handleApply = (i: number) => {
    const newApplied = [...applied];
    newApplied[i] = !newApplied[i];
    setApplied(newApplied);
    onApplyChange?.(i);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {hunks.map((hunk, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "10px",
            overflow: "hidden",
            background: "rgba(15, 23, 42, 0.7)",
          }}
        >
          {/* Original */}
          <pre
            style={{
              flex: 1,
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fecaca",
              margin: 0,
              padding: "0.5rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {hunk.original}
          </pre>

          {/* Modified */}
          <pre
            style={{
              flex: 1,
              background: "rgba(34, 197, 94, 0.15)",
              color: "#bbf7d0",
              margin: 0,
              padding: "0.5rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {hunk.modified}
          </pre>

          <button
            onClick={() => handleApply(idx)}
            style={{
              alignSelf: "center",
              margin: "0 0.5rem",
              padding: "0.25rem 0.5rem",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              background: applied[idx] ? "#2563eb" : "rgba(148, 163, 184, 0.35)",
              color: applied[idx] ? "#fff" : "#e2e8f0",
              transition: "background 0.2s",
            }}
          >
            {applied[idx] ? "Applied" : "Apply"}
          </button>
        </div>
      ))}
    </div>
  );
};

export default LiveDiff;
