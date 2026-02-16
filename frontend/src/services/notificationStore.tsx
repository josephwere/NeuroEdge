// frontend/src/services/notificationStore.ts
import NotificationContainer from "@/components/NotificationContainer";
import React, { createContext, useContext, useRef, useState } from "react";

export type NotificationType = "info" | "success" | "warn" | "error" | "ai";

export interface Notification {
  id: string;
  message: string;
  type?: NotificationType;
  duration?: number; // ms
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id">) => string;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const recentKeysRef = useRef<Map<string, number>>(new Map());

  const addNotification = (n: Omit<Notification, "id">) => {
    const key = `${n.type || "info"}:${n.message.trim()}`;
    const now = Date.now();
    const lastSeen = recentKeysRef.current.get(key);
    if (lastSeen && now - lastSeen < 3000) {
      return "";
    }
    recentKeysRef.current.set(key, now);

    const id = Date.now().toString() + Math.random();
    const notification: Notification = { id, ...n, duration: n.duration ?? 5000 };
    setNotifications((prev) => [...prev, notification].slice(-3));

    // Auto-remove after duration
    setTimeout(() => removeNotification(id), notification.duration);
    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <NotificationContainer notifications={notifications} remove={removeNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationProvider");
  return ctx;
};
