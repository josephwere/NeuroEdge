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
      top: "20px",
      right: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      zIndex: 9999,
    }}
  >
    {notifications.map((n) => (
      <div
        key={n.id}
        style={{
          minWidth: "250px",
          padding: "10px 14px",
          borderRadius: "8px",
          color: "#fff",
          background: getColor(n.type),
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
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
      return "#36c36c";
    case "warn":
      return "#faad14";
    case "error":
      return "#ff4d4f";
    case "ai":
      return "#40a9ff";
    default:
      return "#1e1e2f";
  }
};

export default NotificationContainer;
