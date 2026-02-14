// frontend/src/services/uiStore.ts

import { createContext, useContext, useState } from "react";

/* -------------------- */
/* Types */
/* -------------------- */
export interface User {
  name: string;
  email: string;
  token: string;
  guest: boolean;
}

interface UIState {
  /* Sidebar */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /* Notifications / Approvals */
  unreadCount: number;
  approvalsPending: number;

  /* User / Login */
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;

  /* Theme */
  theme: "light" | "dark";
  toggleTheme: () => void;

  /* Preferences */
  aiResponseVerbosity: "short" | "medium" | "long";
  setAiResponseVerbosity: (level: "short" | "medium" | "long") => void;
}

const UIContext = createContext<UIState | null>(null);

/* -------------------- */
/* Provider */
/* -------------------- */
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* Sidebar */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /* Notifications / Approvals */
  const [unreadCount, setUnreadCount] = useState(0);
  const [approvalsPending, setApprovalsPending] = useState(0);

  /* User */
  const [user, setUserState] = useState<User | null>(null);
  const setUser = (u: User) => {
    setUserState(u);
    localStorage.setItem("neuroedge_user", JSON.stringify(u));
  };
  const logout = () => {
    setUserState(null);
    localStorage.removeItem("neuroedge_user");
  };

  /* Theme */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const toggleTheme = () => setTheme(t => (t === "light" ? "dark" : "light"));

  /* AI Preferences */
  const [aiResponseVerbosity, setAiResponseVerbosity] = useState<"short" | "medium" | "long">("medium");

  /* Sidebar toggle */
  const toggleSidebar = () => setSidebarCollapsed(v => !v);

  return (
    <UIContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar,
        unreadCount,
        approvalsPending,
        user,
        setUser,
        logout,
        theme,
        toggleTheme,
        aiResponseVerbosity,
        setAiResponseVerbosity,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

/* -------------------- */
/* Hook */
/* -------------------- */
export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside UIProvider");
  return ctx;
};
