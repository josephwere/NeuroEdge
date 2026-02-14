// frontend/src/stores/notificationStore.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";
import NotificationContainer, { Notification } from "@/components/NotificationContainer";

/* -------------------- */
/* Types */
/* -------------------- */
interface NotificationsContextType {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

/* -------------------- */
/* Context */
/* -------------------- */
const NotificationsContext = createContext<NotificationsContextType | null>(null);

/* -------------------- */
/* Hook for components */
/* -------------------- */
export const useNotifications = (): NotificationsContextType => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
};

/* -------------------- */
/* Provider */
/* -------------------- */
export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (n: Omit<Notification, "id">) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`; // more unique
    setNotifications(prev => [...prev, { ...n, id }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <NotificationsContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <NotificationContainer notifications={notifications} remove={removeNotification} />
    </NotificationsContext.Provider>
  );
};
