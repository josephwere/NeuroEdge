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
  const blockLauncherClickRef = useRef(false);

  /* Floating chat position */
  const [floatingPosition, setFloatingPosition] = useState({ x: 20, y: 20 });

  /* AI Suggestions state (overlay-ready) */
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [launcherPos, setLauncherPos] = useState({
    x: Math.max(24, window.innerWidth - 72),
    y: 88,
  });

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
      setLauncherPos(pos => ({
        x: Math.min(pos.x, innerWidth - 48),
        y: Math.max(56, Math.min(pos.y, innerHeight - 48)),
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

  useEffect(() => {
    if (floatingOpen) return;
    const el = document.getElementById("floating-launcher");
    if (!el) return;

    let mx = 0;
    let my = 0;
    let x = launcherPos.x;
    let y = launcherPos.y;
    let moved = false;

    const down = (e: MouseEvent) => {
      moved = false;
      mx = e.clientX;
      my = e.clientY;
      document.onmousemove = move;
      document.onmouseup = up;
    };

    const move = (e: MouseEvent) => {
      moved = true;
      x += e.clientX - mx;
      y += e.clientY - my;
      mx = e.clientX;
      my = e.clientY;
      x = Math.max(8, Math.min(window.innerWidth - 48, x));
      y = Math.max(56, Math.min(window.innerHeight - 48, y));
      setLauncherPos({ x, y });
    };

    const up = () => {
      if (moved) {
        blockLauncherClickRef.current = true;
        setTimeout(() => {
          blockLauncherClickRef.current = false;
        }, 0);
      }
      document.onmousemove = null;
      document.onmouseup = null;
    };

    el.addEventListener("mousedown", down);
    return () => el.removeEventListener("mousedown", down);
  }, [floatingOpen, launcherPos.x, launcherPos.y]);

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
          backgroundColor: "var(--ne-bg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          outline: "none",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Main Chat */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", zIndex: 1 }}>
          <MainChat orchestrator={orchestrator} />
        </div>

        {/* Floating overlay window */}
        {floatingOpen && (
          <FloatingChat
            orchestrator={orchestrator}
            initialPosition={floatingPosition}
            onPositionChange={setFloatingPosition}
            onClose={() => setFloatingOpen(false)}
          />
        )}

        {/* Draggable launcher icon */}
        {!floatingOpen && (
          <button
            id="floating-launcher"
            onClick={() => {
              if (blockLauncherClickRef.current) return;
              setFloatingOpen(true);
            }}
            title="Open Floating Chat"
            style={{
              position: "fixed",
              left: launcherPos.x,
              top: launcherPos.y,
              zIndex: 10020,
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: "var(--ne-surface)",
              color: "var(--ne-text)",
              fontSize: "1rem",
              cursor: "move",
              boxShadow: "0 6px 16px rgba(15, 23, 42, 0.18)",
            }}
          >
            ✦
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
