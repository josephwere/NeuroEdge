import React, { useEffect, useState } from "react";
import { useNotifications } from "@/stores/notificationStore";

/* -------------------- */
/* Types */
/* -------------------- */
export type ViewType =
  | "chat"
  | "dashboard"
  | "settings"
  | "history"
  | "extensions";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (view: ViewType) => void;
  unreadChats?: number;
  pendingApprovals?: number;
  user?: {
    name: string;
    mode: "guest" | "local" | "account";
  };
}

/* -------------------- */
/* Sidebar Component */
/* -------------------- */
const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  onNavigate,
  unreadChats = 0,
  pendingApprovals = 0,
  user = { name: "Guest User", mode: "local" },
}) => {
  const { notifications, addNotification, removeNotification } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

  /* Seed demo notifications ONCE */
  useEffect(() => {
    if (notifications.length === 0) {
      addNotification({ message: "New AI suggestion available", type: "ai" });
      addNotification({ message: "Error executing command", type: "error" });
      addNotification({ message: "Chat synced successfully", type: "success" });
    }
  }, [addNotification, notifications.length]);

  return (
    <div style={sidebarStyle(collapsed)}>
      {/* ---------- Header ---------- */}
      <div style={headerStyle(collapsed)}>
        {!collapsed && <strong style={{ fontSize: "1.1rem" }}>🧠 NeuroEdge</strong>}
        <button onClick={onToggle} style={iconButton}>
          {collapsed ? "➡️" : "⬅️"}
        </button>
      </div>

      {/* ---------- Profile ---------- */}
      <div style={profileStyle}>
        <Avatar letter={user.name[0]} />
        {!collapsed && (
          <div>
            <div style={{ fontSize: "0.9rem" }}>{user.name}</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              {user.mode === "guest" && "Guest mode"}
              {user.mode === "local" && "Local session"}
              {user.mode === "account" && "Signed in"}
            </div>
          </div>
        )}
      </div>

      {/* ---------- Navigation ---------- */}
      <div style={{ flex: 1, position: "relative" }}>
        <NavItem icon="💬" label="Chat" collapsed={collapsed} badge={unreadChats} onClick={() => onNavigate("chat")} />
        <NavItem icon="📊" label="Dashboard" collapsed={collapsed} onClick={() => onNavigate("dashboard")} />
        <NavItem icon="⚙️" label="Settings" collapsed={collapsed} onClick={() => onNavigate("settings")} />
        <NavItem icon="🕘" label="History" collapsed={collapsed} disabled />
        <NavItem icon="🧩" label="Extensions" collapsed={collapsed} disabled />

        {/* ---------- Notifications ---------- */}
        <div style={{ position: "relative" }}>
          <NavItem
            icon="🔔"
            label="Notifications"
            collapsed={collapsed}
            badge={notifications.length}
            onClick={() => setShowNotifications(v => !v)}
          />

          <div style={notificationDropdownStyle(showNotifications, collapsed)}>
            {notifications.length === 0 && (
              <div style={{ padding: "0.75rem", color: "#aaa" }}>No notifications</div>
            )}

            {notifications.map(n => (
              <div key={n.id} style={notificationItemStyle(n.type)}>
                <span style={{ fontSize: "1rem" }}>
                  {n.type === "error" ? "❌" : n.type === "success" ? "✅" : "🤖"}
                </span>
                <span style={{ flex: 1 }}>{n.message}</span>
                <button onClick={() => removeNotification(n.id)} style={closeBtn}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <NavItem icon="✅" label="Approvals" collapsed={collapsed} badge={pendingApprovals} disabled />
      </div>

      {/* ---------- Quick Actions ---------- */}
      <div style={quickActions}>
        <button style={primaryAction}>➕ {!collapsed && "New Chat"}</button>
        <button style={secondaryAction}>🔐 {!collapsed && "Login / Get Started"}</button>
      </div>
    </div>
  );
};

export default Sidebar;

/* ================= SUB COMPONENTS ================= */

const NavItem: React.FC<any> = ({ icon, label, collapsed, onClick, disabled, badge }) => (
  <div
    onClick={!disabled ? onClick : undefined}
    style={{
      padding: "0.75rem 1rem",
      display: "flex",
      gap: "0.75rem",
      alignItems: "center",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      transition: "all 0.2s ease",
    }}
    onMouseEnter={e => !disabled && (e.currentTarget.style.background = "#3a3aff22")}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
  >
    <span>{icon}</span>
    {!collapsed && <span>{label}</span>}
    {badge && badge > 0 && !collapsed && (
      <span style={badgeStyle}>{badge}</span>
    )}
  </div>
);

const Avatar: React.FC<{ letter: string }> = ({ letter }) => (
  <div style={avatarStyle}>{letter.toUpperCase()}</div>
);

/* ================= STYLES ================= */

const sidebarStyle = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? "64px" : "240px",
  background: "#1e1e2f",
  color: "#fff",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  transition: "width 0.25s ease",
});

const headerStyle = (collapsed: boolean): React.CSSProperties => ({
  padding: "1rem",
  display: "flex",
  justifyContent: collapsed ? "center" : "space-between",
  alignItems: "center",
  borderBottom: "1px solid #2b2b3c",
});

const profileStyle: React.CSSProperties = {
  padding: "1rem",
  display: "flex",
  gap: "0.75rem",
  borderBottom: "1px solid #2b2b3c",
};

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#3a3aff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
};

const notificationDropdownStyle = (open: boolean, collapsed: boolean): React.CSSProperties => ({
  position: "absolute",
  right: 0,
  top: "42px",
  width: collapsed ? 0 : 240,
  maxHeight: open ? 280 : 0,
  overflow: "hidden",
  background: "#2b2b3c",
  borderRadius: 8,
  transition: "all 0.3s ease",
  boxShadow: open ? "0 8px 30px rgba(0,0,0,0.45)" : "none",
  zIndex: 100,
});

const notificationItemStyle = (type?: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem",
  margin: "4px",
  borderRadius: 6,
  fontSize: "0.8rem",
  background:
    type === "error" ? "#ff4d4f22" :
    type === "success" ? "#52c41a22" :
    "#3a3aff22",
});

const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  cursor: "pointer",
};

const badgeStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "#ff4d4f",
  borderRadius: 12,
  padding: "0 6px",
  fontSize: "0.7rem",
};

const quickActions: React.CSSProperties = {
  padding: "1rem",
  borderTop: "1px solid #2b2b3c",
};

const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  cursor: "pointer",
};

const primaryAction: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  background: "#3a3aff",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontWeight: "bold",
  cursor: "pointer",
  marginBottom: "0.5rem",
  transition: "all 0.25s ease",
};

const secondaryAction: React.CSSProperties = {
  ...primaryAction,
  background: "#2b2b3c",
};
