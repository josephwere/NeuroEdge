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
  const { toggleTheme, user } = useUI();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeView, setActiveView] = useState<
    "chat" | "my_chats" | "projects" | "dashboard" | "settings" | "history" | "extensions"
  >("chat");
  const [showTutorial, setShowTutorial] = useState(false);
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("neuroedge_tutorial_seen") === "1";
    if (!seen) setShowTutorial(true);
  }, []);

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
      setActiveView("dashboard");
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
          <FounderAssistant orchestrator={orchestrator} />

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
            {activeView === "dashboard" && (
              <WindowShell title="Dashboard" onClose={() => setActiveView("chat")}>
                <Dashboard />
              </WindowShell>
            )}
            {activeView === "settings" && (
              <WindowShell title="Settings" onClose={() => setActiveView("chat")}>
                <SettingsPanel />
              </WindowShell>
            )}
            {activeView === "extensions" && (
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
            <Login embedded onSuccess={() => setShowLoginPage(false)} />
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
