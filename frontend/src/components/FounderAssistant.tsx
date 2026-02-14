// frontend/src/components/FounderAssistant.tsx

import React, { useEffect, useState } from "react";
import { OrchestratorClient } from "@/services/orchestrator_client";

/* -------------------- Types -------------------- */
export interface FounderMessage {
  type: "status" | "info" | "warning" | "error";
  message: string;
  timestamp?: number;
}

interface Props {
  orchestrator: OrchestratorClient;
}

interface AlertItem extends FounderMessage {
  id: number;
}

/* -------------------- FounderAssistant Component -------------------- */
const FounderAssistant: React.FC<Props> = ({ orchestrator }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [nextId, setNextId] = useState(1);

  /* ---------------- Listen for founder messages ---------------- */
  useEffect(() => {
    const handler = (msg: FounderMessage) => {
      const id = nextId;
      setNextId(id + 1);

      // Add alert to UI
      setAlerts(prev => [...prev, { ...msg, id }]);

      // Speak message
      speak(msg.message);

      // Auto-remove after 6 seconds
      setTimeout(() => removeAlert(id), 6000);
    };

    orchestrator.onFounderMessage(handler);
    return () => orchestrator.offFounderMessage(handler);
  }, [orchestrator, nextId]);

  /* ---------------- TTS ---------------- */
  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } else {
      console.warn("TTS not supported in this browser");
    }
  };

  /* ---------------- Remove Alert ---------------- */
  const removeAlert = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  /* ---------------- Type Colors ---------------- */
  const typeColor = (type: FounderMessage["type"]) => {
    switch (type) {
      case "status": return "#3b82f6"; // blue
      case "info": return "#10b981";   // green
      case "warning": return "#f59e0b";// orange
      case "error": return "#ef4444";  // red
      default: return "#6b7280";       // gray
    }
  };

  /* ---------------- Render ---------------- */
  return (
    <div style={{
      position: "fixed",
      top: 20,
      right: 20,
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      zIndex: 9999,
    }}>
      {alerts.map(alert => (
        <div
          key={alert.id}
          style={{
            backgroundColor: "#1f2937",
            color: "#fff",
            borderLeft: `5px solid ${typeColor(alert.type)}`,
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            minWidth: "280px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: "transform 0.2s ease, opacity 0.2s ease",
          }}
          onClick={() => removeAlert(alert.id)}
        >
          <strong style={{ textTransform: "capitalize" }}>{alert.type}</strong>: {alert.message}
        </div>
      ))}
    </div>
  );
};

export default FounderAssistant;
