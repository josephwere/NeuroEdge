import React, { useState, useEffect, useRef } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { chatContext } from "@/services/chatContext";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { saveToCache, getCache } from "@/services/offlineCache";
import AISuggestionOverlay from "@/components/AISuggestionsOverlay";
import { generateSuggestions, AISuggestion } from "@/services/aiSuggestionEngine";
import { FounderMessage } from "@/components/FounderAssistant";

interface ExecutionResult {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
}

interface LogLine {
  id: string;
  text: string;
  type?: "info" | "warn" | "error" | "ml" | "mesh";
  codeLanguage?: string;
  isCode?: boolean;
  collapsible?: boolean;
  collapsibleOpen?: boolean;
  associatedId?: string;
  timestamp?: number;
}

interface ApprovalRequest {
  id: string;
  message: string;
  command?: string;
}

interface FloatingChatProps {
  orchestrator: OrchestratorClient;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

const PAGE_SIZE = 20;

const FloatingChat: React.FC<FloatingChatProps> = ({
  orchestrator,
  initialPosition,
  onPositionChange
}) => {
  const [messages, setMessages] = useState<LogLine[]>([]);
  const [displayed, setDisplayed] = useState<LogLine[]>([]);
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition || { x: 20, y: 20 });

  // --- Drag & Move ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mx = 0, my = 0;
    let x = position.x, y = position.y;

    const down = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      document.onmousemove = move;
      document.onmouseup = up;
    };

    const move = (e: MouseEvent) => {
      x += e.clientX - mx;
      y += e.clientY - my;
      mx = e.clientX; my = e.clientY;
      setPosition({ x, y });
      onPositionChange?.({ x, y });
    };

    const up = () => { document.onmousemove = null; document.onmouseup = null; };

    el.querySelector(".header")?.addEventListener("mousedown", down);
    return () => el.querySelector(".header")?.removeEventListener("mousedown", down);
  }, [position.x, position.y, onPositionChange]);

  // --- Load cache ---
  useEffect(() => {
    const cached = getCache();
    if (cached.length) {
      const logs: LogLine[] = cached.map(c => ({
        id: c.id,
        text: c.payload.text,
        type: c.payload.type,
        timestamp: c.timestamp,
        collapsible: c.payload.isCode,
        collapsibleOpen: true,
        isCode: c.payload.isCode,
        codeLanguage: c.payload.codeLanguage
      }));
      setMessages(logs);
      setDisplayed(logs.slice(-PAGE_SIZE));
      setPage(1);
    }
  }, []);

  // --- FounderAssistant Commands ---
  useEffect(() => {
    const founderHandler = (msg: FounderMessage) => {
      const text = msg.message.toLowerCase();
      if (text.includes("inspect")) {
        const node = text.split("inspect ")[1];
        addMessage(`🔍 Inspecting node: ${node}…`, "ml");

        orchestrator.runCheck?.(node)
          .then(res => {
            addMessage(`✅ Node ${node} status: ${res.status}`, "info");
            orchestrator.emitFounderMessage({
              type: "status",
              message: `Inspection complete: ${node} is ${res.status}`
            });
          })
          .catch(err => addMessage(`❌ Node inspection failed: ${err.message}`, "error"));
      }
    };

    orchestrator.onFounderMessage(founderHandler);
    return () => orchestrator.offFounderMessage(founderHandler);
  }, [orchestrator]);

  // --- AI Suggestions ---
  useEffect(() => {
    if (!input.trim()) return setSuggestions([]);
    const timer = setTimeout(async () => {
      const s = await generateSuggestions(input, "floating");
      setSuggestions(s);
    }, 250);
    return () => clearTimeout(timer);
  }, [input]);

  const acceptSuggestion = (s: AISuggestion) => {
    if (s.type === "command") {
      setInput(s.text); setSuggestions([]); setTimeout(send, 0);
    } else {
      setInput(prev => prev + " " + s.text); setSuggestions([]);
    }
  };

  // --- Infinite scroll ---
  const fetchMore = () => {
    const start = messages.length - (page + 1) * PAGE_SIZE;
    const nextBatch = messages.slice(Math.max(0, start), messages.length - page * PAGE_SIZE);
    setDisplayed(prev => [...nextBatch, ...prev]);
    setPage(prev => prev + 1);
  };

  // --- Send Command ---
  const send = async () => {
    if (!input.trim()) return;
    setSuggestions([]);
    const context = chatContext.getAll();
    const commandId = Date.now().toString();

    addMessage(`💻 ${input}`, "info");
    saveToCache({ id: commandId, timestamp: Date.now(), type: "chat", payload: { role: "user", text: input, type: "info" } });

    const userInput = input;
    setInput("");

    try {
      const res = await orchestrator.execute({ command: userInput, context });

      if (res.reasoning) addMessage(`🧠 Reasoning: ${res.reasoning}`, "ml");
      if (res.intent) addMessage(`🎯 Intent: ${res.intent}`, "ml");
      if (res.risk) addMessage(`⚠️ Risk Level: ${res.risk}`, "warn");

      if (res.logs) res.logs.forEach(l => addMessage(`[Log] ${l}`, "info"));
      if (res.meshStatus) res.meshStatus.forEach((n: any) => addMessage(`🌐 [${n.node}] ${n.status}`, "mesh"));
      if (res.results) res.results.forEach((r: ExecutionResult) => addMessage(r.success ? r.stdout : `❌ ${r.stderr}`, r.success ? "info" : "error"));
      if (res.approvals) res.approvals.forEach(addApproval);

    } catch (err: any) {
      addMessage(`❌ Error: ${err.message || err}`, "error");
    }
  };

  // --- Helpers ---
  const addMessage = (text: string, type?: LogLine["type"], codeLanguage?: string, isCode?: boolean) => {
    const id = Date.now().toString() + Math.random();
    const msg: LogLine = { id, text, type, codeLanguage, isCode, collapsible: isCode, collapsibleOpen: true, timestamp: Date.now() };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { text, type, codeLanguage, isCode } });
  };

  const addApproval = (app: ApprovalRequest) => {
    const msg: LogLine = { id: app.id, text: `[Approval] ${app.message}`, type: "ml", associatedId: app.id, timestamp: Date.now() };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
  };

  const extractLanguage = (codeBlock: string) => {
    const match = codeBlock.match(/```(\w+)?/);
    return match ? match[1] : "text";
  };

  // --- Render ---
  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: "450px",
        height: minimized ? "48px" : "560px",
        background: "#1e1e2f",
        color: "#fff",
        borderRadius: "12px",
        boxShadow: "0 0 30px rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div className="header" style={{ padding: "10px", cursor: "move", background: "#2b2b3c", display: "flex", justifyContent: "space-between" }}>
        <strong>NeuroEdge Floating Chat</strong>
        <button onClick={() => setMinimized(!minimized)}>{minimized ? "⬆️" : "⬇️"}</button>
      </div>

      {!minimized && (
        <>
          <div id="floatingChatScroll" style={{ flex: 1, overflowY: "auto", padding: "10px", fontFamily: "monospace" }}>
            <InfiniteScroll
              dataLength={displayed.length}
              next={fetchMore}
              hasMore={displayed.length < messages.length}
              inverse
              scrollableTarget="floatingChatScroll"
              loader={<div style={{ textAlign: "center" }}>Loading…</div>}
            >
              {displayed.map(m => <div key={m.id} style={{ marginBottom: "4px" }}>{m.text}</div>)}
            </InfiniteScroll>
          </div>

          <div style={{ position: "relative", display: "flex" }}>
            <AISuggestionOverlay suggestions={suggestions} onAccept={acceptSuggestion} />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") send();
                if (e.key === "Tab" && suggestions.length) { e.preventDefault(); acceptSuggestion(suggestions[0]); }
                if (e.key === "Escape") setSuggestions([]);
              }}
              placeholder="execute • debug • fix • analyze"
              style={{ flex: 1, padding: "10px", background: "#2b2b3c", border: "none", color: "#fff" }}
            />
            <button onClick={send} style={{ padding: "10px", background: "#3a3aff", border: "none", color: "#fff" }}>▶</button>
          </div>
        </>
      )}
    </div>
  );
};

export default FloatingChat;
