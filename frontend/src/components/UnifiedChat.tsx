// frontend/src/components/UnifiedChat.tsx
import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import MainChat from "@/components/MainChat";
import FloatingChat from "@/components/FloatingChat";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { EventBusProvider } from "@/services/eventBus";


/**
 * UnifiedChat
 * - Hosts MainChat + FloatingChat
 * - Owns AI suggestion keyboard UX (Tab / Esc)
 * - Acts as orchestration layer only (no UI pollution)
 */

interface Props {
  orchestrator: OrchestratorClient;
}

interface Suggestion {
  id: string;
  text: string;
}

const UnifiedChat: React.FC<Props> = ({ orchestrator }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  /* Floating chat position */
  const [floatingPosition, setFloatingPosition] = useState({ x: 20, y: 20 });

  /* AI Suggestions state (overlay-ready) */
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [floatingOpen, setFloatingOpen] = useState(false);

  /**
   * Accept a suggestion (top-ranked)
   * Emits via EventBus so MainChat stays decoupled
   */
  const acceptSuggestion = (suggestion: Suggestion) => {
    window.dispatchEvent(
      new CustomEvent("neuroedge:acceptSuggestion", {
        detail: suggestion.text,
      })
    );
    setSuggestions([]);
  };

  /**
   * Keyboard UX
   * - Tab → accept top suggestion
   * - Esc → dismiss suggestions
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!suggestions.length) return;

    if (e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion(suggestions[0]);
    }

    if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  /**
   * Ensure floating chat stays inside viewport
   */
  useEffect(() => {
    const handleResize = () => {
      const { innerWidth, innerHeight } = window;
      setFloatingPosition(pos => ({
        x: Math.min(pos.x, innerWidth - 420),
        y: Math.min(pos.y, innerHeight - 560),
      }));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const toggleFloating = () => setFloatingOpen((v) => !v);
    window.addEventListener("neuroedge:toggleFloating", toggleFloating as EventListener);
    return () =>
      window.removeEventListener(
        "neuroedge:toggleFloating",
        toggleFloating as EventListener
      );
  }, []);

  return (
    <EventBusProvider>
      <div
        ref={containerRef}
        tabIndex={0} // REQUIRED for keyboard capture
        onKeyDown={handleKeyDown}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          backgroundColor: "#f5f6fa",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          outline: "none",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Main Chat */}
        <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
          <MainChat
            orchestrator={orchestrator}
          />
        </div>

        {/* Floating Chat */}
        {floatingOpen && (
          <FloatingChat
            orchestrator={orchestrator}
            initialPosition={floatingPosition}
            onPositionChange={setFloatingPosition}
            onClose={() => setFloatingOpen(false)}
          />
        )}

        {/* Meta-AI style launcher */}
        {!floatingOpen && (
          <button
            onClick={() => setFloatingOpen(true)}
            style={{
              position: "fixed",
              right: 18,
              bottom: 18,
              zIndex: 10002,
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              border: "none",
              borderRadius: 999,
              padding: "0.58rem 0.9rem",
              background: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 60%, #1d4ed8 100%)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.83rem",
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(37, 99, 235, 0.35)",
            }}
            title="Open Floating AI Chat"
          >
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>✦</span>
            <span>Ask NeuroEdge AI</span>
          </button>
        )}

        {/* 
          AI Suggestions Overlay will plug here later
          <AISuggestionOverlay suggestions={suggestions} />
        */}
      </div>
    </EventBusProvider>
  );
};

export default UnifiedChat;
