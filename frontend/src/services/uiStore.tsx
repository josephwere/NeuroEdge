// frontend/src/services/uiStore.ts

import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  themePreference: "system" | "light" | "dark";
  toggleTheme: () => void;
  setThemePreference: (pref: "system" | "light" | "dark") => void;

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
  const systemPrefersDark = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const [themePreference, setThemePreference] = useState<"system" | "light" | "dark">(() => {
    const saved = localStorage.getItem("neuroedge_theme_pref") as "system" | "light" | "dark" | null;
    return saved || "system";
  });

  const theme = useMemo<"light" | "dark">(() => {
    if (themePreference === "system") {
      return systemPrefersDark() ? "dark" : "light";
    }
    return themePreference;
  }, [themePreference]);

  const toggleTheme = () => {
    setThemePreference((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    localStorage.setItem("neuroedge_theme_pref", themePreference);
    document.documentElement.setAttribute("data-theme", theme);
  }, [themePreference, theme]);

  useEffect(() => {
    if (themePreference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => document.documentElement.setAttribute("data-theme", media.matches ? "dark" : "light");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [themePreference]);

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
        themePreference,
        toggleTheme,
        setThemePreference,
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
