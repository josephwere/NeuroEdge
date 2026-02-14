// frontend/src/components/ContextAwareUI.tsx
import React, { ReactNode, CSSProperties } from "react";

export type UserMode = "dev" | "researcher" | "creator";

interface Props {
  mode: UserMode;
  children: ReactNode;
  style?: CSSProperties; // optional for future overrides
}

const ContextAwareUI: React.FC<Props> = ({ mode, children, style }) => {
  const backgroundMap: Record<UserMode, string> = {
    dev: "#f0f4ff",
    researcher: "#fffaf0",
    creator: "#f0fff4",
  };

  const combinedStyle: CSSProperties = {
    background: backgroundMap[mode],
    minHeight: "100%",
    transition: "background 0.3s ease",
    ...style,
  };

  return <div style={combinedStyle}>{children}</div>;
};

export default ContextAwareUI;
