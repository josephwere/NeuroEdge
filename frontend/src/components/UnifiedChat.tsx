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
  const floatingStateKey = "neuroedge_floating_state_v1";
  const floatingOnly = (() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("floating") === "1";
    } catch {
      return false;
    }
  })();
  const containerRef = useRef<HTMLDivElement>(null);
  const blockLauncherClickRef = useRef(false);
  const popoutBootstrappedRef = useRef(false);
  const popoutWindowRef = useRef<Window | null>(null);
  const isMobileViewport = () => window.innerWidth <= 768;
  const centerFloating = () => ({
    x: Math.max(12, Math.round(window.innerWidth - 470)),
    y: Math.max(70, Math.round(window.innerHeight / 2 - 260)),
  });
  const centerLauncher = () => ({
    x: Math.max(10, Math.round(window.innerWidth - (isMobileViewport() ? 58 : 52))),
    y: Math.max(80, Math.round(window.innerHeight / 2 - (isMobileViewport() ? 22 : 18))),
  });

  /* Floating chat position */
  const [floatingPosition, setFloatingPosition] = useState(centerFloating);

  /* AI Suggestions state (overlay-ready) */
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [floatingOpen, setFloatingOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(floatingStateKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.open);
    } catch {
      return false;
    }
  });
  const [launcherPos, setLauncherPos] = useState(centerLauncher);
  const [launcherVisible, setLauncherVisible] = useState(() => {
    try {
      const raw = localStorage.getItem(floatingStateKey);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      return parsed?.launcherVisible !== false;
    } catch {
      return true;
    }
  });
  const [popoutActive, setPopoutActive] = useState(() => {
    try {
      const raw = localStorage.getItem(floatingStateKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed?.mode === "popout";
    } catch {
      return false;
    }
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
        x: Math.min(Math.max(8, pos.x), innerWidth - 48),
        y: isMobileViewport()
          ? Math.max(80, Math.min(pos.y, innerHeight - 56))
          : Math.max(56, Math.min(pos.y, innerHeight - 48)),
      }));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    try {
      const payload = {
        open: floatingOpen,
        x: floatingPosition.x,
        y: floatingPosition.y,
        launcherX: launcherPos.x,
        launcherY: launcherPos.y,
        launcherVisible,
        mode: popoutActive ? "popout" : "inline",
      };
      localStorage.setItem(floatingStateKey, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [floatingOpen, floatingPosition.x, floatingPosition.y, launcherPos.x, launcherPos.y, launcherVisible, popoutActive]);

  useEffect(() => {
    const sync = (evt: StorageEvent) => {
      if (evt.key !== floatingStateKey || !evt.newValue) return;
      try {
        const parsed = JSON.parse(evt.newValue);
        if (typeof parsed?.open === "boolean") setFloatingOpen(parsed.open);
        if (typeof parsed?.launcherVisible === "boolean") setLauncherVisible(parsed.launcherVisible);
        if (typeof parsed?.mode === "string") setPopoutActive(parsed.mode === "popout");
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setFloatingPosition({ x: parsed.x, y: parsed.y });
        }
        if (typeof parsed?.launcherX === "number" && typeof parsed?.launcherY === "number") {
          setLauncherPos({ x: parsed.launcherX, y: parsed.launcherY });
        }
      } catch {
        // ignore malformed payload
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const openDetachedFloating = () => {
    const width = 470;
    const height = 720;
    const left = Math.max(0, window.screenX + window.outerWidth - width - 20);
    const top = Math.max(0, window.screenY + Math.round((window.outerHeight - height) / 2));
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?floating=1`;
    setFloatingOpen(false);
    setPopoutActive(true);
    try {
      const raw = localStorage.getItem(floatingStateKey);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        floatingStateKey,
        JSON.stringify({
          ...prev,
          open: false,
          mode: "popout",
          launcherVisible,
          x: floatingPosition.x,
          y: floatingPosition.y,
          launcherX: launcherPos.x,
          launcherY: launcherPos.y,
        })
      );
    } catch {
      // ignore storage failures
    }
    popoutWindowRef.current = window.open(
      url,
      "neuroedge-floating-chat",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  const ensureDetachedFloating = () => {
    const width = 470;
    const height = 720;
    const left = Math.max(0, window.screenX + window.outerWidth - width - 20);
    const top = Math.max(0, window.screenY + Math.round((window.outerHeight - height) / 2));
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?floating=1`;
    const win = window.open(
      url,
      "neuroedge-floating-chat",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (!win) {
      setPopoutActive(false);
      return;
    }
    popoutWindowRef.current = win;
    win.focus();
  };

  useEffect(() => {
    const toggleFloating = () => {
      if (popoutActive) {
        const existing = popoutWindowRef.current;
        if (existing && !existing.closed) {
          existing.focus();
        } else {
          ensureDetachedFloating();
        }
        return;
      }
      setLauncherVisible(true);
      setFloatingOpen((v) => !v);
    };
    window.addEventListener("neuroedge:toggleFloating", toggleFloating as EventListener);
    return () =>
      window.removeEventListener(
        "neuroedge:toggleFloating",
        toggleFloating as EventListener
      );
  }, [popoutActive]);

  useEffect(() => {
    if (floatingOnly || !popoutActive || popoutBootstrappedRef.current) return;
    popoutBootstrappedRef.current = true;
    ensureDetachedFloating();
  }, [floatingOnly, popoutActive]);

  useEffect(() => {
    if (!popoutActive || floatingOnly) return;
    const timer = window.setInterval(() => {
      const w = popoutWindowRef.current;
      if (w && w.closed) {
        setPopoutActive(false);
        setLauncherVisible(true);
        popoutWindowRef.current = null;
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [popoutActive, floatingOnly]);

  useEffect(() => {
    if (!floatingOnly) return;
    try {
      const raw = localStorage.getItem(floatingStateKey);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        floatingStateKey,
        JSON.stringify({
          ...prev,
          open: false,
          mode: "popout",
        })
      );
    } catch {
      // ignore
    }
    const onUnload = () => {
      try {
        const raw = localStorage.getItem(floatingStateKey);
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          floatingStateKey,
          JSON.stringify({
            ...prev,
            mode: "inline",
            open: false,
          })
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [floatingOnly]);

  useEffect(() => {
    if (floatingOpen || !launcherVisible || popoutActive) return;
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
      y = isMobileViewport()
        ? Math.max(80, Math.min(window.innerHeight - 56, y))
        : Math.max(56, Math.min(window.innerHeight - 48, y));
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
  }, [floatingOpen, launcherPos.x, launcherPos.y, launcherVisible, popoutActive]);

  if (floatingOnly) {
    return (
      <EventBusProvider>
        <div
          style={{
            height: "100vh",
            width: "100%",
            background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
          }}
        >
          <FloatingChat
            orchestrator={orchestrator}
            embedded
            onClose={() => window.close()}
          />
        </div>
      </EventBusProvider>
    );
  }

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
          background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          outline: "none",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          color: "#e2e8f0",
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
            onPopout={openDetachedFloating}
          />
        )}

        {/* Draggable launcher icon */}
        {!floatingOpen && launcherVisible && !popoutActive && (
          <div
            style={{
              position: "fixed",
              left: launcherPos.x,
              top: launcherPos.y,
              zIndex: 10020,
            }}
          >
            <button
              id="floating-launcher"
              onClick={() => {
                if (blockLauncherClickRef.current) return;
                setFloatingPosition(centerFloating());
                setFloatingOpen(true);
              }}
              title="Open Floating Chat"
              style={{
                width: isMobileViewport() ? 44 : 36,
                height: isMobileViewport() ? 44 : 36,
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background: "rgba(15, 23, 42, 0.9)",
                color: "transparent",
                cursor: "move",
                boxShadow: "0 8px 20px rgba(15, 23, 42, 0.35)",
                backgroundImage: "url('/icon.png')",
                backgroundSize: "70% 70%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            >
              ✦
            </button>
            <button
              onClick={() => setLauncherVisible(false)}
              title="Hide floating launcher"
              style={{
                position: "absolute",
                right: -6,
                top: -6,
                width: 16,
                height: 16,
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(15,23,42,0.95)",
                color: "#e2e8f0",
                fontSize: 10,
                lineHeight: "14px",
                textAlign: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {!floatingOpen && !launcherVisible && !popoutActive && (
          <button
            onClick={() => setLauncherVisible(true)}
            title="Restore floating launcher"
            style={{
              position: "fixed",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10010,
              border: "1px solid rgba(148,163,184,0.45)",
              borderRight: "none",
              borderRadius: "10px 0 0 10px",
              background: "rgba(15,23,42,0.95)",
              color: "#e2e8f0",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 10px",
              cursor: "pointer",
            }}
          >
            Floating
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
