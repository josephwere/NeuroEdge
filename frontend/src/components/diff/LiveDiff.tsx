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
            border: "1px solid #ccc",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          {/* Original */}
          <pre
            style={{
              flex: 1,
              background: "#ffecec",
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
              background: "#e6ffed",
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
              background: applied[idx] ? "#3a3aff" : "#d1d5db",
              color: "#fff",
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
