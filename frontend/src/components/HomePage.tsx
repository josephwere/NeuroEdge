// frontend/src/components/HomePage.tsx

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import UnifiedChat from "@/components/UnifiedChat";
import ChatSearchBar from "@/components/ChatSearchBar";
import Dashboard from "@/components/Dashboard";
import CommandPalette from "@/components/CommandPalette";
import ChatHistoryPanel from "@/components/ChatHistoryPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";
import ExtensionsPanel from "@/components/ExtensionsPanel";
import MyChatsPanel from "@/components/MyChatsPanel";
import ProjectsPanel from "@/components/ProjectsPanel";
import FounderAssistant from "@/components/FounderAssistant"; // Founder voice & alerts
import TutorialGuide from "@/components/TutorialGuide";
import Login from "@/pages/Login";
import ProfileSettings from "@/components/ProfileSettings";

import { OrchestratorClient } from "@/services/orchestrator_client";
import { useChatHistory } from "@/services/chatHistoryStore";
import { useNotifications } from "@/services/notificationStore";
import { exportChatJSON, exportChatTXT } from "@/services/chatExport";
import { useUI } from "@/services/uiStore";
import { confirmSafeAction } from "@/services/safetyPrompts";

import { loadExtension } from "@/extensions/extensionLoader";
import codeLinter from "@/extensions/examples/codeLinter";

interface WindowShellProps {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  modal?: boolean;
}

class PanelErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Unknown render error" };
  }

  componentDidCatch(error: Error) {
    console.error(`[NeuroEdge] ${this.props.title} render failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "1rem", color: "#e2e8f0" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{this.props.title} crashed</div>
          <div style={{ marginBottom: 10, color: "#fca5a5" }}>{this.state.message}</div>
          <button
            style={{
              border: "1px solid rgba(148,163,184,0.45)",
              background: "rgba(15,23,42,0.85)",
              color: "#e2e8f0",
              borderRadius: 10,
              padding: "0.42rem 0.75rem",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Retry Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const WindowShell: React.FC<WindowShellProps> = ({ title, children, onClose, modal = false }) => {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);

  return (
    <div
      style={
        modal
          ? modalWindowStyle(maximized)
          : maximized
          ? mainWindowMaximizedStyle
          : mainWindowStyle
      }
    >
      <div style={windowHeaderStyle}>
        <div style={{ fontWeight: 700, letterSpacing: "0.01em" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <button style={windowBtnStyle("#f59e0b")} onClick={() => setMinimized((v) => !v)} title={minimized ? "Expand" : "Minimize"}>
            {minimized ? "▢" : "—"}
          </button>
          <button style={windowBtnStyle("#22c55e")} onClick={() => setMaximized((v) => !v)} title={maximized ? "Restore" : "Maximize"}>
            {maximized ? "❐" : "□"}
          </button>
          <button style={windowBtnStyle("#ef4444")} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>
      {!minimized && <div style={windowBodyStyle}>{children}</div>}
    </div>
  );
};

/* ----------------------------- */
/* Home Content for Chat View    */
/* ----------------------------- */
const HomeContent: React.FC<{ orchestrator: OrchestratorClient }> = ({ orchestrator }) => {
  const [paletteVisible, setPaletteVisible] = useState(false);

  /* Command Palette Keyboard Shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteVisible(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Chat Search */}
      <ChatSearchBar
        onSearch={(query, filters) => {
          console.log("Search query:", query, "Filters:", filters);
        }}
      />

      {/* Unified Chat */}
      <UnifiedChat orchestrator={orchestrator} />

      {/* Command Palette */}
      <CommandPalette
        orchestrator={orchestrator}
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
      />
    </div>
  );
};

/* ----------------------------- */
/* Main HomePage Component       */
/* ----------------------------- */
interface Props {
  orchestrator: OrchestratorClient;
}

const HomePage: React.FC<Props> = ({ orchestrator }) => {
  const { allMessages, resetHistory } = useChatHistory();
  const { addNotification } = useNotifications();
  const { toggleTheme, user } = useUI();
  const orchestratorUrl = (import.meta.env.VITE_ORCHESTRATOR_URL as string) || "http://localhost:7070";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeView, setActiveView] = useState<
    "chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions"
  >("chat");
  const [allowedViews, setAllowedViews] = useState<
    Array<"chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions">
  >(["chat"]);
  const [internalToolsEnabled, setInternalToolsEnabled] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const fallbackViewsForUser = React.useCallback(() => {
    const role = String(user?.role || "").toLowerCase();
    const signedIn = Boolean(
      user &&
        (!user.guest || !!user.email || !!user.token || ["founder", "admin", "developer", "enterprise", "user"].includes(role))
    );
    if (!signedIn) {
      return ["chat"] as Array<"chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions">;
    }
    const base: Array<"chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions"> = [
      "chat",
      "my_chats",
      "projects",
      "dashboard",
      "settings",
      "history",
    ];
    if (["founder", "admin", "developer"].includes(role)) base.push("extensions");
    return base;
  }, [user]);

  useEffect(() => {
    const seen = localStorage.getItem("neuroedge_tutorial_seen") === "1";
    if (!seen) setShowTutorial(true);
  }, []);

  useEffect(() => {
    const run = async () => {
      const fallbackViews = fallbackViewsForUser();
      setAllowedViews(fallbackViews);
      setInternalToolsEnabled(["founder", "admin", "developer"].includes(String(user?.role || "").toLowerCase()));
      const envApiKey = String(import.meta.env.VITE_NEUROEDGE_API_KEY || "").trim();
      const looksLikeJwt = (token?: string) => {
        const t = String(token || "").trim();
        return t.split(".").length === 3;
      };
      const headers: Record<string, string> = {
        "x-user-role": String(user?.role || "guest"),
        "x-user-plan": String(user?.plan || "free"),
      };
      if (envApiKey) {
        headers["x-api-key"] = envApiKey;
        headers.Authorization = `Bearer ${envApiKey}`;
      }
      if (user?.email) headers["x-user-email"] = user.email;
      if (user?.name) headers["x-user-name"] = user.name;
      if (!envApiKey && looksLikeJwt(user?.token)) headers.Authorization = `Bearer ${user?.token}`;
      try {
        const res = await fetch(`${orchestratorUrl.replace(/\/$/, "")}/app/config?client=web`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const rawViews = Array.isArray(data?.shell?.sidebarViews) ? data.shell.sidebarViews : [];
        const normalized = rawViews
          .map((v: string) => String(v))
          .filter((v: string) =>
            ["chat", "my_chats", "projects", "dashboard", "settings", "history", "extensions"].includes(v)
          ) as Array<"chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions">;
        if (normalized.length > 0) setAllowedViews(normalized);
        setInternalToolsEnabled(Boolean(data?.shell?.featureFlags?.internalToolsEnabled));
      } catch {
        // keep local signed-in fallback defaults
      }
    };
    void run();
  }, [orchestratorUrl, user?.email, user?.name, user?.plan, user?.role, user?.token, fallbackViewsForUser]);

  useEffect(() => {
    if (!allowedViews.includes(activeView)) setActiveView("chat");
  }, [allowedViews, activeView]);

  /* ---------------- Extensions Loader ---------------- */
  useEffect(() => {
    const extCtx = {
      orchestrator,
      notify: (msg: string, type: any = "info") =>
        console.log(`[Notification ${type}] ${msg}`),
      getUserProfile: () => ({ name: "Guest User", mode: "local" }),
      requestPermission: async (perm: string) => true,
      registerCommand: (cmd: any) =>
        console.log("Registered extension command:", cmd),
    };

    // Load default example extension
    loadExtension(codeLinter, extCtx);
  }, [orchestrator]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const view = (evt as CustomEvent).detail as
        | "chat"
        | "my_chats"
        | "projects"
        | "dashboard"
        | "settings"
        | "history"
        | "extensions";
      if (view) setActiveView(view);
    };
    window.addEventListener("neuroedge:navigate", handler as EventListener);
    return () => window.removeEventListener("neuroedge:navigate", handler as EventListener);
  }, []);

  const startNewChat = () => {
    setActiveView("chat");
    window.dispatchEvent(new CustomEvent("neuroedge:newChat"));
  };

  const handleTopbarCommand = (cmd: string) => {
    const normalized = cmd.trim().toLowerCase();
    if (normalized === "new chat") {
      startNewChat();
      return;
    }
    if (normalized === "open settings") {
      setActiveView("settings");
      return;
    }
    if (normalized === "my chats") {
      setActiveView("my_chats");
      return;
    }
    if (normalized === "projects") {
      setActiveView("projects");
      return;
    }
    if (normalized === "neuroedge diagnostics") {
      if (allowedViews.includes("dashboard")) setActiveView("dashboard");
      return;
    }
    if (normalized === "export chat") {
      const url = exportChatJSON(allMessages);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neuroedge_chat_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (normalized === "clear history") {
      if (!confirmSafeAction({ title: "chat history", actionLabel: "clear", chatMode: true })) return;
      resetHistory();
      startNewChat();
      return;
    }
    if (normalized === "toggle theme") {
      toggleTheme();
      return;
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          backgroundColor: "var(--ne-bg)",
        }}
      >
        {/* ---------------- Sidebar ---------------- */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNavigate={setActiveView}
          allowedViews={allowedViews}
          user={{
            name: user?.name || "Guest User",
            mode: !user || user.guest ? "guest" : "account",
          }}
          onNewChat={startNewChat}
          onLogin={() => setShowLoginPage(v => !v)}
          onOpenNotifications={() => setActiveView("history")}
          onOpenProfile={() => setShowProfileModal(true)}
        />

        {/* ---------------- Main Area ---------------- */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minWidth: 0,
          }}
        >
          {/* Topbar */}
          <Topbar
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onCommand={handleTopbarCommand}
            onNavigate={setActiveView}
            onNewChat={startNewChat}
          />

          {/* Founder Assistant (voice + alerts) */}
          {internalToolsEnabled && <FounderAssistant orchestrator={orchestrator} />}

          {/* Main Content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {activeView === "chat" && <HomeContent orchestrator={orchestrator} />}
            {activeView === "my_chats" && (
              <WindowShell title="My Chats" onClose={() => setActiveView("chat")}>
                <MyChatsPanel />
              </WindowShell>
            )}
            {activeView === "projects" && (
              <WindowShell title="Projects" onClose={() => setActiveView("chat")}>
                <ProjectsPanel />
              </WindowShell>
            )}
            {activeView === "dashboard" && allowedViews.includes("dashboard") && (
              <WindowShell title="Dashboard" onClose={() => setActiveView("chat")}>
                <PanelErrorBoundary title="Dashboard">
                  <Dashboard />
                </PanelErrorBoundary>
              </WindowShell>
            )}
            {activeView === "settings" && (
              <WindowShell title="Settings" onClose={() => setActiveView("chat")}>
                <SettingsPanel />
              </WindowShell>
            )}
            {activeView === "extensions" && allowedViews.includes("extensions") && (
              <WindowShell title="Extensions" onClose={() => setActiveView("chat")}>
                <ExtensionsPanel />
              </WindowShell>
            )}
            {activeView === "history" && (
              <WindowShell title="History & Governance" onClose={() => setActiveView("chat")}>
                <ChatHistoryPanel />
              </WindowShell>
            )}
          </div>
        </div>
      </div>
      {showLoginPage && (
        <div style={overlayStyle}>
          <WindowShell title="Login / Access" modal onClose={() => setShowLoginPage(false)}>
            <Login
              embedded
              onSuccess={(payload) => {
                setShowLoginPage(false);
                if (payload?.guest) return;
                const name = payload?.name || "there";
                addNotification({
                  type: "success",
                  message: `Welcome ${name}. Login successful.`,
                });
                window.dispatchEvent(
                  new CustomEvent("neuroedge:welcomeMessage", {
                    detail: {
                      name,
                      role: payload?.role || "user",
                      plan: payload?.plan || "free",
                    },
                  })
                );
                setShowTutorial(true);
              }}
            />
          </WindowShell>
        </div>
      )}
      {showProfileModal && (
        <div style={overlayStyle}>
          <WindowShell title="Profile & Settings" modal onClose={() => setShowProfileModal(false)}>
            <ProfileSettings
              session={{
                name: user?.name,
                email: user?.email,
                mode: user?.guest ? "guest" : "account",
                token: user?.token,
              }}
              onClose={() => setShowProfileModal(false)}
            />
          </WindowShell>
        </div>
      )}
      <TutorialGuide
        open={showTutorial}
        onSkip={() => {
          localStorage.setItem("neuroedge_tutorial_seen", "1");
          setShowTutorial(false);
        }}
        onFinish={() => {
          localStorage.setItem("neuroedge_tutorial_seen", "1");
          setShowTutorial(false);
        }}
      />
    </>
  );
};

export default HomePage;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999,
  padding: "1rem",
};

const mainWindowStyle: React.CSSProperties = {
  margin: "0.65rem",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.82)",
  boxShadow: "0 16px 36px rgba(2,6,23,0.42)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  flex: 1,
  overflow: "hidden",
};

const mainWindowMaximizedStyle: React.CSSProperties = {
  ...mainWindowStyle,
  position: "absolute",
  inset: "0.65rem",
  zIndex: 25,
  margin: 0,
};

const modalWindowStyle = (maximized: boolean): React.CSSProperties => ({
  width: maximized ? "min(1200px, 96vw)" : "min(860px, 96vw)",
  height: maximized ? "92vh" : "min(86vh, 900px)",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.96)",
  boxShadow: "0 16px 42px rgba(2,6,23,0.56)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

const windowHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.52rem 0.72rem",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.95)",
  color: "#e2e8f0",
  fontSize: "0.8rem",
};

const windowBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

const windowBtnStyle = (bg: string): React.CSSProperties => ({
  border: "none",
  borderRadius: 8,
  background: bg,
  color: "#fff",
  padding: "0.2rem 0.48rem",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.75rem",
});
