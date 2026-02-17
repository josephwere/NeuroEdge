import React, { useState, useEffect, useRef } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { chatContext } from "@/services/chatContext";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { saveToCache, getCache, clearCache } from "@/services/offlineCache";
import AISuggestionOverlay from "@/components/AISuggestionsOverlay";
import { generateSuggestions, AISuggestion } from "@/services/aiSuggestionEngine";
import { FounderMessage } from "@/components/FounderAssistant";
import { useChatHistory } from "@/services/chatHistoryStore";
import { isFounderUser } from "@/services/founderAccess";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import { confirmSafeAction } from "@/services/safetyPrompts";

interface ExecutionResult {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
}

interface LogLine {
  id: string;
  text: string;
  role?: "user" | "assistant";
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
  onClose?: () => void;
  embedded?: boolean;
}

const PAGE_SIZE = 20;
const SHOW_AI_META = String(import.meta.env.VITE_SHOW_AI_META || "").toLowerCase() === "true";

const FloatingChat: React.FC<FloatingChatProps> = ({
  orchestrator,
  initialPosition,
  onPositionChange,
  onClose,
  embedded = false,
}) => {
  const { addMessage: addHistoryMessage } = useChatHistory();
  const [messages, setMessages] = useState<LogLine[]>([]);
  const [displayed, setDisplayed] = useState<LogLine[]>([]);
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition || { x: 20, y: 20 });
  const longPressTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isSending, setIsSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const sendRunRef = useRef(0);
  const [recordingDraft, setRecordingDraft] = useState("");
  const recordingDraftRef = useRef("");
  const [listenSeq, setListenSeq] = useState(0);

  // --- Drag & Move ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el || maximized || embedded) return;

    let mx = 0, my = 0;
    let x = position.x, y = position.y;

    const down = (e: MouseEvent) => {
      // Avoid starting drag when interacting with inputs/buttons
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button, input, textarea, select, a")) return;
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

    el.addEventListener("mousedown", down);
    return () => el.removeEventListener("mousedown", down);
  }, [position.x, position.y, onPositionChange, maximized, embedded]);

  // --- Load cache ---
  useEffect(() => {
    const cached = getCache();
    if (cached.length) {
      const logs: LogLine[] = cached.map(c => ({
        id: c.id,
        text: c.payload.text,
        role: c.payload.role || "assistant",
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

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    const clearForNewChat = () => {
      setMessages([]);
      setDisplayed([]);
      setPage(0);
      setInput("");
      setSuggestions([]);
      chatContext.clear();
      clearCache();
    };

    window.addEventListener("neuroedge:newChat", clearForNewChat as EventListener);
    return () =>
      window.removeEventListener(
        "neuroedge:newChat",
        clearForNewChat as EventListener
      );
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
  const sendText = async (text: string) => {
    if (!text.trim() || isSending) return;
    setSuggestions([]);
    setIsSending(true);
    const runId = Date.now();
    sendRunRef.current = runId;
    const context = chatContext.getAll();
    const commandId = Date.now().toString();

    addMessage(text, "info", undefined, undefined, "user");
    addHistoryMessage({ id: commandId, role: "user", text, type: "info" });
    saveToCache({ id: commandId, timestamp: Date.now(), type: "chat", payload: { role: "user", text, type: "info" } });
    setInput("");

    try {
      const res = await orchestrator.execute({ command: text, context });
      if (runId !== sendRunRef.current) return;

      const founderDebugVisible = SHOW_AI_META || isFounderUser();
      if (founderDebugVisible && res.reasoning) addMessage(`🧠 Reasoning: ${res.reasoning}`, "ml");
      if (founderDebugVisible && res.intent) addMessage(`🎯 Intent: ${res.intent}`, "ml");
      if (founderDebugVisible && res.risk) addMessage(`⚠️ Risk Level: ${res.risk}`, "warn");

      if (founderDebugVisible && res.logs) res.logs.forEach(l => addMessage(`[Log] ${l}`, "info"));
      if (founderDebugVisible && res.meshStatus) res.meshStatus.forEach((n: any) => addMessage(`🌐 [${n.node}] ${n.status}`, "mesh"));
      if (res.results) {
        res.results.forEach((r: ExecutionResult) => {
          const stderr = String(r?.stderr || "");
          if (!r.success && stderr.toLowerCase().includes("ml inference failed")) {
            addMessage("⚠️ ML temporarily unavailable. Using local fallback.", "warn");
            return;
          }
          const stdout = String(r?.stdout || "");
          if (r.success && stdout.includes("kernel accepted")) {
            const normalized = stdout.replace("kernel accepted execute:", "NeuroEdge received:");
            addMessage(normalized, "info");
            return;
          }
          addMessage(r.success ? stdout : `❌ ${r.stderr}`, r.success ? "info" : "error");
        });
      }
      if (res.approvals) res.approvals.forEach(addApproval);

    } catch (err: any) {
      if (runId !== sendRunRef.current) return;
      addMessage(`❌ Error: ${err.message || err}`, "error");
    } finally {
      if (runId === sendRunRef.current) setIsSending(false);
    }
  };

  const send = async () => {
    await sendText(input);
  };

  const cancelSend = () => {
    sendRunRef.current = Date.now() + 1;
    setIsSending(false);
    addMessage("⛔ Request canceled by user.", "warn");
  };

  // --- Helpers ---
  const addMessage = (
    text: string,
    type?: LogLine["type"],
    codeLanguage?: string,
    isCode?: boolean,
    role: LogLine["role"] = "assistant"
  ) => {
    const id = Date.now().toString() + Math.random();
    const msg: LogLine = { id, text, role, type, codeLanguage, isCode, collapsible: isCode, collapsibleOpen: true, timestamp: Date.now() };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { role, text, type, codeLanguage, isCode } });
    addHistoryMessage({ id, role: role || "assistant", text, type, isCode, codeLanguage });
  };

  const addApproval = (app: ApprovalRequest) => {
    const msg: LogLine = { id: app.id, text: `[Approval] ${app.message}`, type: "ml", associatedId: app.id, timestamp: Date.now() };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const applyMessageEdit = (id: string, nextText: string) => {
    const clean = nextText.trim();
    if (!clean) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: clean } : m)));
    setDisplayed((prev) => prev.map((m) => (m.id === id ? { ...m, text: clean } : m)));
  };

  const applyMessageDelete = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setDisplayed((prev) => prev.filter((m) => m.id !== id));
  };

  const promptMessageAction = (m: LogLine) => {
    if (m.role !== "user") return;
    const action = window.prompt("Type E to edit or D to delete this message:", "E");
    if (!action) return;
    const normalized = action.trim().toLowerCase();
    if (normalized === "d") {
      if (confirmSafeAction({ title: "chat message", actionLabel: "delete", chatMode: true })) {
        applyMessageDelete(m.id);
      }
      return;
    }
    if (normalized === "e") {
      const next = window.prompt("Edit your message:", m.text);
      if (next !== null) applyMessageEdit(m.id, next);
    }
  };

  const onUploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join(", ");
    setInput((prev) => `${prev}${prev ? "\n" : ""}[Attached] ${names}`);
  };

  const onDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    onUploadFiles(e.dataTransfer?.files || null);
  };

  const toggleVoiceInput = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      addMessage("⚠️ Voice input is not supported in this browser.", "warn");
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    setListenSeq((v) => v + 1);
    setRecordingDraft("");
    recordingDraftRef.current = "";
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((r: any) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      recordingDraftRef.current = transcript;
      setRecordingDraft(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const acceptRecordingDraft = () => {
    if (!recordingDraft.trim()) return;
    setInput((prev) => `${prev} ${recordingDraft}`.trim());
    setRecordingDraft("");
    recordingDraftRef.current = "";
  };

  const sendRecordingDraft = async () => {
    if (!recordingDraft.trim()) return;
    const text = recordingDraft.trim();
    setRecordingDraft("");
    recordingDraftRef.current = "";
    await sendText(text);
  };

  const cancelRecordingDraft = () => {
    setRecordingDraft("");
    recordingDraftRef.current = "";
  };

  const startLongPress = (m: LogLine) => {
    if (m.role !== "user") return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      promptMessageAction(m);
      longPressTimer.current = null;
    }, 550);
  };

  const endLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const renderRichText = (text: string) => {
    const nodes: React.ReactNode[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        const before = text.slice(lastIndex, m.index).trim();
        if (before) {
          nodes.push(
            <div key={`t-${idx++}`} style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {before}
            </div>
          );
        }
      }
      nodes.push(
        <div key={`c-${idx++}`} style={{ marginTop: "0.45rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.2rem 0.35rem",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              borderBottom: "none",
              borderRadius: "8px 8px 0 0",
              background: "rgba(15, 23, 42, 0.85)",
              fontSize: "0.68rem",
              color: "#cbd5e1",
            }}
          >
            <span>{(m[1] || "text").trim()}</span>
            <button
              onClick={() => copyText(m[2] || "")}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "transparent",
                color: "#e2e8f0",
                borderRadius: 6,
                padding: "0.1rem 0.35rem",
                cursor: "pointer",
              }}
            >
              Copy
            </button>
          </div>
          <SyntaxHighlighter language={(m[1] || "text").trim()} style={okaidia} showLineNumbers>
            {m[2] || ""}
          </SyntaxHighlighter>
        </div>
      );
      lastIndex = regex.lastIndex;
    }
    const tail = text.slice(lastIndex).trim();
    if (tail) {
      nodes.push(
        <div key={`t-${idx++}`} style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {tail}
        </div>
      );
    }
    return nodes.length ? nodes : [<div key="empty" />];
  };

  const renderBubble = (m: LogLine) => {
    const isUser = m.role === "user";
    const bubbleStyle: React.CSSProperties = isUser
      ? {
          marginLeft: "auto",
          maxWidth: "80%",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
          color: "#f8fafc",
          borderRadius: "14px 14px 4px 14px",
          padding: "0.55rem 0.75rem",
        }
      : {
          marginRight: "auto",
          maxWidth: "86%",
          background: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          color: "#e2e8f0",
          borderRadius: "14px 14px 14px 4px",
          padding: "0.55rem 0.75rem",
        };
    return (
      <div key={m.id} style={{ marginBottom: "0.55rem" }}>
        <div
          style={bubbleStyle}
          onDoubleClick={() => promptMessageAction(m)}
          onTouchStart={() => startLongPress(m)}
          onTouchEnd={endLongPress}
          onTouchCancel={endLongPress}
        >
          {renderRichText(m.text)}
        </div>
        {!isUser && (
          <div style={{ marginTop: "0.15rem" }}>
            <button
              onClick={() => copyText(m.text)}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.15rem 0.4rem",
                cursor: "pointer",
                fontSize: "0.68rem",
              }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    );
  };

  // --- Render ---
  return (
    <div
      ref={containerRef}
      style={{
        position: embedded ? "relative" : "fixed",
        left: embedded ? 0 : maximized ? 24 : position.x,
        top: embedded ? 0 : maximized ? 24 : position.y,
        width: embedded ? "100%" : maximized ? "calc(100vw - 48px)" : "450px",
        height: embedded ? "100%" : minimized ? "48px" : maximized ? "calc(100vh - 48px)" : "560px",
        maxWidth: "100vw",
        maxHeight: "100vh",
        background: "rgba(15, 23, 42, 0.9)",
        color: "#e2e8f0",
        borderRadius: embedded ? "0" : "12px",
        boxShadow: embedded ? "none" : "0 12px 30px rgba(15, 23, 42, 0.55)",
        zIndex: embedded ? 1 : 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="header" style={{ padding: "10px", cursor: maximized || embedded ? "default" : "move", background: "rgba(15, 23, 42, 0.95)", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(148, 163, 184, 0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <img src="/logo.png" alt="NeuroEdge" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover" }} />
          <strong>NeuroEdge Floating Chat</strong>
          {!embedded && (
            <>
              <button
                title="New Chat"
                onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:newChat"))}
                style={miniActionStyle}
              >
                New Chat
              </button>
              <button
                title="History"
                onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "history" }))}
                style={miniActionStyle}
              >
                History
              </button>
              <button
                title="Diagnostics"
                onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "dashboard" }))}
                style={miniActionStyle}
              >
                Diagnostics
              </button>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          {!embedded && (
            <>
              <button
                title="Minimize"
                onClick={() => setMinimized((v) => !v)}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(148, 163, 184, 0.3)", cursor: "pointer", background: "rgba(15, 23, 42, 0.8)", color: "#e2e8f0" }}
              >
                {minimized ? "▢" : "—"}
              </button>
              <button
                title={maximized ? "Restore" : "Maximize"}
                onClick={() => {
                  setMinimized(false);
                  setMaximized((v) => !v);
                }}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(148, 163, 184, 0.3)", cursor: "pointer", background: "rgba(15, 23, 42, 0.8)", color: "#e2e8f0" }}
              >
                {maximized ? "❐" : "□"}
              </button>
            </>
          )}
          <button
            title="Close"
            onClick={() => onClose?.()}
            style={{ width: 24, height: 24, borderRadius: 6, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff" }}
          >
            ✕
          </button>
        </div>
      </div>

      {(!minimized || embedded) && (
        <>
          <div id="floatingChatScroll" style={{ flex: 1, overflowY: "auto", padding: "10px", fontFamily: "monospace", color: "#e2e8f0" }}>
            <InfiniteScroll
              dataLength={displayed.length}
              next={fetchMore}
              hasMore={displayed.length < messages.length}
              inverse
              scrollableTarget="floatingChatScroll"
              loader={<div style={{ textAlign: "center", color: "#94a3b8" }}>Loading…</div>}
            >
              {displayed.map(renderBubble)}
            </InfiniteScroll>
          </div>

          <div
            style={{
              position: "relative",
              display: "flex",
              borderTop: "1px solid rgba(148,163,184,0.2)",
              padding: 8,
              gap: 6,
              background: dragActive ? "rgba(56,189,248,0.08)" : "transparent",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDropFiles}
          >
            <AISuggestionOverlay suggestions={suggestions} onAccept={acceptSuggestion} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              style={{ display: "none" }}
              onChange={(e) => onUploadFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px", background: "#0ea5e9", border: "none", color: "#fff", borderRadius: 8, marginRight: 6, fontWeight: 700 }}
              title="Upload files"
            >
              ＋
            </button>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") send();
                  if (e.key === "Tab" && suggestions.length) { e.preventDefault(); acceptSuggestion(suggestions[0]); }
                  if (e.key === "Escape") setSuggestions([]);
                }}
                placeholder="execute • debug • fix • analyze"
                style={{
                  width: "100%",
                  padding: "10px 7.9rem 10px 10px",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  color: isListening ? "transparent" : "#e2e8f0",
                  caretColor: isListening ? "transparent" : "#e2e8f0",
                  borderRadius: 8,
                  outline: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 8,
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {!!recordingDraft && !isListening ? (
                  <>
                    <button
                      onClick={sendRecordingDraft}
                      style={inlineRoundBtn("#16a34a", "#fff")}
                      title="Send recorded transcript"
                    >
                      ↑
                    </button>
                    <button
                      onClick={acceptRecordingDraft}
                      style={inlineRoundBtn("#ffffff", "#0f172a", "1px solid rgba(255,255,255,0.65)")}
                      title="Use recorded transcript"
                    >
                      ✓
                    </button>
                    <button
                      onClick={cancelRecordingDraft}
                      style={inlineRoundBtn("#dc2626", "#fff")}
                      title="Discard recording"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    onClick={toggleVoiceInput}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: "transparent",
                      color: "#e2e8f0",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "1.05rem",
                      lineHeight: 1,
                      display: "grid",
                      placeItems: "center",
                    }}
                    title={isListening ? "Stop voice input" : "Start voice input"}
                  >
                    {isListening ? "◼" : "🎤"}
                  </button>
                )}
              </div>
              {isListening && (
                <div
                  style={{
                    position: "absolute",
                    inset: "0.18rem 0.45rem",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                    opacity: 0.9,
                    overflow: "hidden",
                  }}
                >
                  <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginRight: 5 }}>Listening</span>
                  <div
                    key={`listen-fill-${listenSeq}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      height: 1,
                      background: "rgba(148,163,184,0.42)",
                      transform: "translateY(-50%)",
                      animation: "neFill 0.95s ease-out forwards",
                    }}
                  />
                  <div style={{ display: "flex", width: "100%" }}>
                    {Array.from({ length: 44 }).map((_, i) => (
                      <span
                        key={`fw-${i}`}
                        style={{
                          width: 3,
                          marginRight: 2,
                          height: 7 + (i % 4) * 3,
                          borderRadius: 3,
                          background: "rgba(148,163,184,0.75)",
                          animation: `neWave 1s ${i * 0.05}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={isSending ? cancelSend : send}
              style={{
                width: 44,
                height: 44,
                background: isSending ? "#dc2626" : "#2563eb",
                border: "none",
                color: "#fff",
                borderRadius: 999,
                marginLeft: 6,
                fontWeight: 700,
                fontSize: "1.28rem",
                animation: isSending ? "neSpin 1s linear infinite" : "none",
              }}
              title={isSending ? "Cancel" : "Send"}
            >
              {isSending ? "■" : "↑"}
            </button>
          </div>
        </>
      )}
      <style>{`@keyframes neSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes neWave { 0%,100%{ transform: scaleY(0.45); opacity:0.45;} 50%{ transform: scaleY(1); opacity:1;} } @keyframes neFill { from { width: 0%; } to { width: 100%; } }`}</style>
    </div>
  );
};

export default FloatingChat;

const inlineRoundBtn = (bg: string, color: string, border = "none"): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 999,
  border,
  background: bg,
  color,
  cursor: "pointer",
  fontWeight: 800,
  display: "grid",
  placeItems: "center",
  lineHeight: 1,
});

const miniActionStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.3)",
  background: "rgba(15, 23, 42, 0.8)",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "0.2rem 0.45rem",
  fontSize: "0.7rem",
  cursor: "pointer",
};
