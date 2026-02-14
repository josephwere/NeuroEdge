// frontend/src/components/SidebarItem.tsx

import React from "react";

interface Props {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  collapsed?: boolean;
  onClick?: () => void;
}

const SidebarItem: React.FC<Props> = ({
  icon,
  label,
  active,
  badge,
  collapsed,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px",
        borderRadius: "8px",
        cursor: "pointer",
        background: active ? "#2d2f45" : "transparent",
        color: "#fff",
        marginBottom: "4px",
        position: "relative",
      }}
    >
      <span style={{ fontSize: "1.2rem", width: "24px" }}>{icon}</span>

      {!collapsed && (
        <span style={{ marginLeft: "10px", flex: 1 }}>{label}</span>
      )}

      {badge && badge > 0 && (
        <span
          style={{
            position: "absolute",
            right: "8px",
            background: "#ff4d4f",
            color: "#fff",
            borderRadius: "999px",
            fontSize: "0.7rem",
            padding: "2px 6px",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
};

export default SidebarItem;
