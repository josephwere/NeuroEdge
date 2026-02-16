import React from "react";

export type NotificationType = "success" | "warn" | "error" | "ai";

export interface Notification {
  id: string;
  message: string;
  type?: NotificationType;
}

interface NotificationContainerProps {
  notifications: Notification[];
  remove: (id: string) => void;
}

const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  remove,
}) => (
  <div
    style={{
      position: "fixed",
      bottom: "16px",
      right: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      zIndex: 1000,
      maxWidth: "360px",
    }}
  >
    {notifications.map((n) => (
      <div
        key={n.id}
        style={{
          minWidth: "280px",
          padding: "10px 12px",
          borderRadius: "10px",
          color: "#e5e7eb",
          background: "#202123",
          border: `1px solid ${getColor(n.type)}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.85rem",
          cursor: "pointer",
          animation: "slideIn 0.3s ease",
        }}
        onClick={() => remove(n.id)}
      >
        <span>{n.message}</span>
        <button
          style={{
            marginLeft: "10px",
            background: "transparent",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontWeight: "bold",
          }}
          onClick={(e) => {
            e.stopPropagation();
            remove(n.id);
          }}
        >
          ✕
        </button>
      </div>
    ))}
  </div>
);

const getColor = (type?: NotificationType) => {
  switch (type) {
    case "success":
      return "#2b8a3e";
    case "warn":
      return "#a06600";
    case "error":
      return "#b42318";
    case "ai":
      return "#1f6feb";
    default:
      return "#3f3f46";
  }
};

export default NotificationContainer;
