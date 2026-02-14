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

  return (
    <EventBusProvider>
      <div
        ref={containerRef}
        tabIndex={0} // REQUIRED for keyboard capture
        onKeyDown={handleKeyDown}
        style={{
          height: "100vh",
          width: "100vw",
          position: "relative",
          backgroundColor: "#f5f6fa",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
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
        <FloatingChat
          orchestrator={orchestrator}
          initialPosition={floatingPosition}
          onPositionChange={setFloatingPosition}
        />

        {/* 
          AI Suggestions Overlay will plug here later
          <AISuggestionOverlay suggestions={suggestions} />
        */}
      </div>
    </EventBusProvider>
  );
};

export default UnifiedChat;
