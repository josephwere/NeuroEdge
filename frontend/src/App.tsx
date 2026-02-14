// frontend/src/App.tsx
import React, { useState, useEffect } from "react";
import BootScreen from "@/components/BootScreen";
import UnifiedChat from "@/components/UnifiedChat";
import CommandPalette from "@/components/CommandPalette";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { registerCommand } from "@/services/commandRegistry";
import { NotificationProvider } from "@/services/notificationStore";

const orchestrator = new OrchestratorClient();

const App: React.FC = () => {
  const [booted, setBooted] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState(false);

  // Handle Ctrl+P for opening command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteVisible(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Register app commands once
  useEffect(() => {
    registerCommand({
      id: "new-chat",
      label: "New Chat",
      shortcut: "Ctrl+N",
      action: () => orchestrator.resetConversation(),
    });
    registerCommand({
      id: "open-settings",
      label: "Open Settings",
      shortcut: "Ctrl+,",
      action: () => console.log("Open Settings"),
    });
    registerCommand({
      id: "export-chat",
      label: "Export Chat",
      action: () => console.log("Export Chat"),
    });
  }, []);

  // Show BootScreen until app is ready
  if (!booted) return <BootScreen onDone={() => setBooted(true)} />;

  // ✅ Wrap everything that uses notifications in the provider
  return (
    <NotificationProvider>
      <UnifiedChat orchestrator={orchestrator} />
      <CommandPalette
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
      />
    </NotificationProvider>
  );
};

export default App;
