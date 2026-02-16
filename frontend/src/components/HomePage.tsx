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
import FounderAssistant from "@/components/FounderAssistant"; // Founder voice & alerts
import TutorialGuide from "@/components/TutorialGuide";

import { ChatHistoryProvider } from "@/services/chatHistoryStore";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { NotificationProvider } from "@/services/notificationStore";

import { loadExtension } from "@/extensions/extensionLoader";
import codeLinter from "@/extensions/examples/codeLinter";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeView, setActiveView] = useState<
    "chat" | "dashboard" | "settings" | "history" | "extensions"
  >("chat");
  const [showTutorial, setShowTutorial] = useState(false);

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

  return (
    <NotificationProvider>
      <ChatHistoryProvider>
        <div
          style={{
            display: "flex",
            height: "100vh",
            width: "100%",
            overflow: "hidden",
            backgroundColor: "#f5f6fa",
          }}
        >
          {/* ---------------- Sidebar ---------------- */}
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNavigate={setActiveView}
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
            <Topbar onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />

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
              {activeView === "dashboard" && <Dashboard />}
              {activeView === "settings" && <SettingsPanel />}
              {activeView === "extensions" && <ExtensionsPanel />}
              {activeView === "history" && <ChatHistoryPanel />}
            </div>
          </div>
        </div>
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
      </ChatHistoryProvider>
    </NotificationProvider>
  );
};

export default HomePage;
