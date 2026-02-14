// frontend/src/components/dashboard/AIConstitutionIndicator.tsx
import React from "react";

interface Props {
  status: "enforced" | "warning" | "violated";
  tooltip?: string;
}

const AIConstitutionIndicator: React.FC<Props> = ({ status, tooltip }) => {
  const color = {
    enforced: "#3a3aff", // blue
    warning: "#facc15",  // yellow
    violated: "#ef4444", // red
  }[status];

  return (
    <div
      title={tooltip}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        fontFamily: "monospace",
        userSelect: "none",
      }}
    >
      <span style={{ color, fontWeight: "bold" }}>🛡️</span>
      <span style={{ fontSize: "0.85rem", color }}>{status.toUpperCase()}</span>
    </div>
  );
};

export default AIConstitutionIndicator;
