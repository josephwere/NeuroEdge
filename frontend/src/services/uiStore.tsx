// frontend/src/services/uiStore.ts

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { applyBrandingToDocument } from "@/services/branding";

/* -------------------- */
/* Types */
/* -------------------- */
export interface User {
  name: string;
  email: string;
  token: string;
  guest: boolean;
  provider?: "email" | "google" | "github" | "phone" | "guest";
  phone?: string;
  country?: string;
  role?: "user" | "moderator" | "admin" | "founder" | "developer" | "enterprise";
  plan?: "free" | "plus" | "pro" | "enterprise" | "business" | "team" | "premium";
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

function normalizeUser(raw: any): User | null {
  if (!raw || typeof raw !== "object") return null;
  const role = String(raw.role || "").trim().toLowerCase();
  const provider = String(raw.provider || "").trim().toLowerCase();
  const email = String(raw.email || "").trim();
  const token = String(raw.token || "").trim();
  const explicitGuest = Boolean(raw.guest);
  const inferredSignedIn =
    (!!email && email.length > 0) ||
    (!!token && token.length > 0) ||
    (provider !== "" && provider !== "guest") ||
    (role !== "" && role !== "guest");
  const guest = inferredSignedIn ? false : explicitGuest;
  return {
    name: String(raw.name || ""),
    email,
    token,
    guest,
    provider: raw.provider,
    phone: raw.phone,
    country: raw.country,
    role: raw.role,
    plan: raw.plan,
  } as User;
}

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
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_user");
      if (!raw) return null;
      return normalizeUser(JSON.parse(raw));
    } catch {
      return null;
    }
  });
  const setUser = (u: User) => {
    const normalized = normalizeUser(u) || u;
    setUserState(normalized);
    localStorage.setItem("neuroedge_user", JSON.stringify(normalized));
  };
  const logout = () => {
    setUserState(null);
    localStorage.removeItem("neuroedge_user");
  };

  useEffect(() => {
    const syncUser = () => {
      try {
        const raw = localStorage.getItem("neuroedge_user");
        if (!raw) {
          setUserState(null);
          return;
        }
        setUserState(normalizeUser(JSON.parse(raw)));
      } catch {
        setUserState(null);
      }
    };
    window.addEventListener("storage", syncUser);
    return () => window.removeEventListener("storage", syncUser);
  }, []);

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
    setThemePreference((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  useEffect(() => {
    localStorage.setItem("neuroedge_theme_pref", themePreference);
    document.documentElement.setAttribute("data-theme", theme);
    applyBrandingToDocument();
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
