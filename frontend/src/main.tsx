// frontend/src/main.tsx

import React from "react";
import ReactDOM from "react-dom/client";

import HomePage from "@/components/HomePage";
import BootScreen from "@/components/BootScreen";

import { UIProvider } from "@/services/uiStore";
import { ChatHistoryProvider } from "@/services/chatHistoryStore";
import { NotificationProvider } from "@/services/notificationStore";
import { OrchestratorClient } from "@/services/orchestrator_client";

import "./styles/globals.css";

/* -------------------- */
/* Orchestrator Bootstrap */
/* -------------------- */

const orchestrator = new OrchestratorClient({
  mode: "frontend",
  safe: true,
});

/* -------------------- */
/* App Root (Boot-Aware) */
/* -------------------- */

const AppRoot: React.FC = () => {
  const [booted, setBooted] = React.useState(false);

  return (
    <>
      {!booted && <BootScreen onDone={() => setBooted(true)} />}
      {booted && <HomePage orchestrator={orchestrator} />}
    </>
  );
};

/* -------------------- */
/* React Mount */
/* -------------------- */

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("NeuroEdge root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <UIProvider>
      <NotificationProvider>
        <ChatHistoryProvider>
          <AppRoot />
        </ChatHistoryProvider>
      </NotificationProvider>
    </UIProvider>
  </React.StrictMode>
);
