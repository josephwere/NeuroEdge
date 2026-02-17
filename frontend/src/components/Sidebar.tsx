import React, { useEffect, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { useUI } from "@/services/uiStore";

/* -------------------- */
/* Types */
/* -------------------- */
export type ViewType =
  | "chat"
  | "my_chats"
  | "projects"
  | "dashboard"
  | "settings"
  | "history"
  | "extensions";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (view: ViewType) => void;
  onNewChat?: () => void;
  onLogin?: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
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
  onNewChat,
  onLogin,
  onOpenNotifications,
  onOpenProfile,
  unreadChats = 0,
  pendingApprovals = 0,
  user = { name: "Guest User", mode: "local" },
}) => {
  const { notifications, removeNotification } = useNotifications();
  const { toggleTheme, logout } = useUI();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileActions, setShowProfileActions] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string>("");
  const [profileName, setProfileName] = useState<string>(user.name);

  useEffect(() => {
    const readProfile = () => {
      try {
        const raw = localStorage.getItem("neuroedge_profile_settings");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setProfileAvatar(String(parsed?.avatarUrl || ""));
        if (parsed?.name) setProfileName(String(parsed.name));
      } catch {
        // ignore profile parse errors
      }
    };
    readProfile();
    window.addEventListener("neuroedge:profileUpdated", readProfile as EventListener);
    window.addEventListener("storage", readProfile);
    return () => {
      window.removeEventListener("neuroedge:profileUpdated", readProfile as EventListener);
      window.removeEventListener("storage", readProfile);
    };
  }, [user.name]);

  return (
    <div style={sidebarStyle(collapsed)}>
      {/* ---------- Header ---------- */}
      <div style={headerStyle(collapsed)}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <img src="/logo.png" alt="NeuroEdge" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover" }} />
          {!collapsed && <strong style={{ fontSize: "1.1rem" }}>NeuroEdge</strong>}
        </div>
        <button onClick={onToggle} style={iconButton}>
          {collapsed ? "➡️" : "⬅️"}
        </button>
      </div>

      {/* ---------- Profile ---------- */}
      <div style={{ ...profileStyle(collapsed), cursor: "pointer", position: "relative" }} onClick={() => setShowProfileActions(v => !v)}>
        <Avatar letter={(profileName || user.name || "G")[0]} src={profileAvatar} />
        {!collapsed && (
          <div>
            <div style={{ fontSize: "0.9rem" }}>{profileName || user.name}</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              {user.mode === "guest" && "Guest mode"}
              {user.mode === "local" && "Local session"}
              {user.mode === "account" && "Signed in"}
            </div>
          </div>
        )}
        {!collapsed && <span style={{ marginLeft: "auto", opacity: 0.8 }}>▾</span>}
        <div style={profileMenuStyle(showProfileActions)}>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); onOpenProfile?.(); setShowProfileActions(false); }}>Profile</button>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); onNavigate("settings"); setShowProfileActions(false); }}>Settings</button>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); onNavigate("dashboard"); setShowProfileActions(false); }}>Dashboard</button>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); onNavigate("my_chats"); setShowProfileActions(false); }}>My Chats</button>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); toggleTheme(); setShowProfileActions(false); }}>Toggle Theme</button>
          <button style={profileMenuItemStyle} onClick={(e) => { e.stopPropagation(); logout(); onLogin?.(); setShowProfileActions(false); }}>Logout</button>
        </div>
      </div>

      {/* ---------- Navigation ---------- */}
      <div style={{ flex: 1, position: "relative" }}>
        <NavItem icon="💬" label="Chat" collapsed={collapsed} badge={unreadChats} onClick={() => onNavigate("chat")} />
        <NavItem icon="🗂️" label="My Chats" collapsed={collapsed} onClick={() => onNavigate("my_chats")} />
        <NavItem icon="📁" label="Projects" collapsed={collapsed} onClick={() => onNavigate("projects")} />
        <NavItem icon="📊" label="Dashboard" collapsed={collapsed} onClick={() => onNavigate("dashboard")} />
        <NavItem icon="⚙️" label="Settings" collapsed={collapsed} onClick={() => onNavigate("settings")} />
        <NavItem icon="🕘" label="History" collapsed={collapsed} onClick={() => onNavigate("history")} />
        <NavItem icon="🧩" label="Extensions" collapsed={collapsed} onClick={() => onNavigate("extensions")} />

        {/* ---------- Notifications ---------- */}
        <div style={{ position: "relative" }}>
          <NavItem
            icon="🔔"
            label="Notifications"
            collapsed={collapsed}
            badge={notifications.length}
            onClick={() => {
              setShowNotifications(v => !v);
              onOpenNotifications?.();
            }}
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

        <NavItem icon="✅" label="Approvals" collapsed={collapsed} badge={pendingApprovals} onClick={() => onNavigate("history")} />
      </div>

      {/* ---------- Quick Actions ---------- */}
      <div style={quickActions}>
        <button style={primaryAction(collapsed)} onClick={onNewChat}>{collapsed ? "➕" : "➕ New Chat"}</button>
        {!collapsed && <button style={secondaryAction} onClick={onLogin}>🔐 Login / Get Started</button>}
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
    onMouseEnter={e => !disabled && (e.currentTarget.style.background = "rgba(37, 99, 235, 0.2)")}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
  >
    <span>{icon}</span>
    {!collapsed && <span>{label}</span>}
    {badge && badge > 0 && !collapsed && (
      <span style={badgeStyle}>{badge}</span>
    )}
  </div>
);

const Avatar: React.FC<{ letter: string; src?: string }> = ({ letter, src }) => (
  src ? <img src={src} alt="avatar" style={avatarImageStyle} /> : <div style={avatarStyle}>{letter.toUpperCase()}</div>
);

/* ================= STYLES ================= */

const sidebarStyle = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? "72px" : "260px",
  minWidth: collapsed ? "72px" : "260px",
  flexShrink: 0,
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  color: "#e2e8f0",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  transition: "width 0.25s ease",
  borderRight: "1px solid rgba(148, 163, 184, 0.2)",
});

const headerStyle = (collapsed: boolean): React.CSSProperties => ({
  padding: "1rem",
  display: "flex",
  justifyContent: collapsed ? "center" : "space-between",
  alignItems: "center",
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
});

const profileStyle = (collapsed: boolean): React.CSSProperties => ({
  padding: "1rem",
  display: "flex",
  gap: collapsed ? 0 : "0.75rem",
  justifyContent: collapsed ? "center" : "flex-start",
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
});

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#2563eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
};

const avatarImageStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  objectFit: "cover",
  border: "1px solid rgba(148, 163, 184, 0.3)",
};

const notificationDropdownStyle = (open: boolean, collapsed: boolean): React.CSSProperties => ({
  position: "absolute",
  right: collapsed ? -168 : 0,
  top: "42px",
  width: 240,
  maxHeight: open ? 280 : 0,
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.8)",
  borderRadius: 8,
  transition: "all 0.3s ease",
  boxShadow: open ? "0 8px 30px rgba(0,0,0,0.45)" : "none",
  zIndex: 100,
});

const profileMenuStyle = (open: boolean): React.CSSProperties => ({
  position: "absolute",
  left: 8,
  right: 8,
  top: "calc(100% + 6px)",
  maxHeight: open ? 280 : 0,
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.96)",
  border: open ? "1px solid rgba(148,163,184,0.25)" : "none",
  borderRadius: 10,
  boxShadow: open ? "0 10px 24px rgba(0,0,0,0.4)" : "none",
  transition: "all 0.2s ease",
  zIndex: 200,
  display: "grid",
  gap: 4,
  padding: open ? 6 : 0,
});

const profileMenuItemStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.7)",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "0.42rem 0.55rem",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "0.8rem",
};

const notificationItemStyle = (type?: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem",
  margin: "4px",
  borderRadius: 6,
  fontSize: "0.8rem",
  background:
    type === "error" ? "rgba(239, 68, 68, 0.2)" :
    type === "success" ? "rgba(34, 197, 94, 0.2)" :
    "rgba(37, 99, 235, 0.2)",
});

const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  cursor: "pointer",
};

const badgeStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "#f87171",
  borderRadius: 12,
  padding: "0 6px",
  fontSize: "0.7rem",
};

const quickActions: React.CSSProperties = {
  padding: "1rem",
  borderTop: "1px solid rgba(148, 163, 184, 0.2)",
};

const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  cursor: "pointer",
};

const primaryAction = (collapsed: boolean): React.CSSProperties => ({
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
  fontSize: collapsed ? "1rem" : "0.82rem",
});

const secondaryAction: React.CSSProperties = {
  ...primaryAction,
  background: "#2b2b3c",
};
