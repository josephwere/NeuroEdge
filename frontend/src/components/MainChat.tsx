import React, { useState, useEffect, useRef } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { chatContext } from "@/services/chatContext";
import { OrchestratorClient } from "@/services/orchestrator_client";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  saveToCache,
  updateCachedItemText,
  deleteCachedItem,
} from "@/services/offlineCache";
import AISuggestionOverlay from "@/components/AISuggestionsOverlay";
import { generateSuggestions, AISuggestion } from "@/services/aiSuggestionEngine";
import { FounderMessage } from "@/components/FounderAssistant";
import { useChatHistory } from "@/services/chatHistoryStore";
import { isFounderUser } from "@/services/founderAccess";
import {
  appendConversationMessage,
  ConversationMessage,
  ensureActiveConversation,
  getConversation,
  importLegacyCacheOnce,
  setActiveConversation,
  updateConversationMessage,
  deleteConversationMessage,
  createConversation,
} from "@/services/conversationStore";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  type?: "info" | "warn" | "error" | "ml";
  isCode?: boolean;
  codeLanguage?: string;
  collapsible?: boolean;
  collapsibleOpen?: boolean;
  timestamp?: number;
}

interface MainChatProps {
  orchestrator: OrchestratorClient;
}

const PAGE_SIZE = 30;
const SHOW_AI_META = String(import.meta.env.VITE_SHOW_AI_META || "").toLowerCase() === "true";

const MainChat: React.FC<MainChatProps> = ({ orchestrator }) => {
  const {
    addMessage: addHistoryMessage,
    updateMessage: updateHistoryMessage,
    deleteMessage: deleteHistoryMessage,
  } = useChatHistory();
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [displayed, setDisplayed] = useState<Message[]>([]);
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const syncContextFromMessages = (nextMessages: Message[]) => {
    chatContext.clear();
    nextMessages.forEach((m) => {
      chatContext.add({
        role: m.role,
        content: m.text,
      });
    });
  };

  const loadConversation = (conversationId: string) => {
    const conversation = getConversation(conversationId);
    if (!conversation) return;
    const logs: Message[] = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      type: m.type,
      timestamp: m.timestamp,
      isCode: m.isCode,
      collapsible: m.isCode,
      collapsibleOpen: true,
      codeLanguage: m.codeLanguage,
    }));
    setActiveConversationId(conversationId);
    setMessages(logs);
    setDisplayed(logs.slice(-PAGE_SIZE));
    setPage(1);
    setInput("");
    syncContextFromMessages(logs);
  };

  useEffect(() => {
    importLegacyCacheOnce();
    const active = ensureActiveConversation();
    loadConversation(active.id);
  }, []);

  useEffect(() => {
    const clearForNewChat = () => {
      const thread = createConversation();
      loadConversation(thread.id);
      setSuggestions([]);
    };
    const openConversation = (evt: Event) => {
      const id = (evt as CustomEvent).detail?.id as string | undefined;
      if (!id) return;
      setActiveConversation(id);
      loadConversation(id);
    };

    window.addEventListener("neuroedge:newChat", clearForNewChat as EventListener);
    window.addEventListener(
      "neuroedge:openConversation",
      openConversation as EventListener
    );
    return () =>
      {
        window.removeEventListener(
          "neuroedge:newChat",
          clearForNewChat as EventListener
        );
        window.removeEventListener(
          "neuroedge:openConversation",
          openConversation as EventListener
        );
      };
  }, []);

  // --- Infinite scroll ---
  const fetchMore = () => {
    const start = messages.length - (page + 1) * PAGE_SIZE;
    const nextBatch = messages.slice(Math.max(0, start), messages.length - page * PAGE_SIZE);
    setDisplayed(prev => [...nextBatch, ...prev]);
    setPage(prev => prev + 1);
  };

  const scrollToBottom = () => messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [displayed]);

  // --- AI suggestions ---
  useEffect(() => {
    if (!input.trim()) return setSuggestions([]);
    const timer = setTimeout(async () => {
      const s = await generateSuggestions(input, "main");
      setSuggestions(s);
    }, 250);
    return () => clearTimeout(timer);
  }, [input]);

  const acceptSuggestion = (s: AISuggestion) => {
    if (s.type === "command") {
      setInput(s.text);
      setSuggestions([]);
      setTimeout(handleSend, 0);
    } else {
      setInput(prev => prev + " " + s.text);
      setSuggestions([]);
    }
  };

  // --- FounderAssistant command parsing + TTS ---
  useEffect(() => {
    const founderHandler = (msg: FounderMessage) => {
      const text = msg.message.toLowerCase();

      // Node inspection command
      if (text.includes("inspect")) {
        const node = text.split("inspect ")[1];
        addMessage(`🔍 Inspecting node: ${node}…`, "ml");

        orchestrator.runCheck?.(node).then(res => {
          addMessage(`✅ Node ${node} status: ${res.status}`, "info");
          speak(`Inspection complete: ${node} is ${res.status}`);
        }).catch(err => {
          addMessage(`❌ Node inspection failed: ${err.message}`, "error");
          speak(`Error inspecting node: ${node}`);
        });
      } else {
        // Other founder messages
        if (isFounderUser()) {
          addMessage(`📣 Founder: ${msg.message}`, msg.type);
          speak(msg.message);
        }
      }
    };

    orchestrator.onFounderMessage(founderHandler);
    return () => orchestrator.offFounderMessage(founderHandler);
  }, [orchestrator]);

  // --- Send message / command ---
  const handleSend = async () => {
    if (!input.trim()) return;
    setSuggestions([]);

    const id = Date.now().toString();
    const userMsg: Message = { id, role: "user", text: input, type: "info" };
    setMessages(m => [...m, userMsg]);
    setDisplayed(d => [...d, userMsg]);
    chatContext.add({ role: "user", content: input });
    addHistoryMessage({ id, role: "user", text: input, type: "info" });
    if (activeConversationId) {
      appendConversationMessage(activeConversationId, {
        id,
        role: "user",
        text: input,
        type: "info",
        timestamp: Date.now(),
      });
    }

    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { role: "user", text: input, type: "info" } });

    const userInput = input;
    setInput("");

    try {
      const currentContext = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));
      const res = await orchestrator.execute({
        command: userInput,
        context: currentContext.slice(-25),
      });

      const founderDebugVisible = SHOW_AI_META || isFounderUser();
      if (founderDebugVisible && res.reasoning) addMessage(`🧠 Reasoning: ${res.reasoning}`, "ml");
      if (founderDebugVisible && res.intent) addMessage(`🎯 Intent: ${res.intent}`, "ml");
      if (founderDebugVisible && res.risk) addMessage(`⚠️ Risk Level: ${res.risk}`, "warn");

      if (founderDebugVisible && res.logs) res.logs.forEach((l: string) => addMessage(`[Log] ${l}`, "info"));
      if (res.results) {
        res.results.forEach((r: any) => {
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
    } catch (err: any) {
      addMessage(`❌ Error: ${err.message || err}`, "error");
    }
  };

  // --- Helpers ---
  const addMessage = (text: string, type?: Message["type"], codeLanguage?: string, isCode?: boolean) => {
    const id = Date.now().toString() + Math.random();
    const msg: Message = { id, text, type, isCode, codeLanguage, collapsible: isCode, collapsibleOpen: true, role: "assistant", timestamp: Date.now() };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { role: "assistant", text, type, codeLanguage, isCode } });
    addHistoryMessage({ id, role: "assistant", text, type, isCode, codeLanguage });
    if (activeConversationId) {
      const threadMessage: ConversationMessage = {
        id,
        role: "assistant",
        text,
        type,
        isCode,
        codeLanguage,
        timestamp: Date.now(),
      };
      appendConversationMessage(activeConversationId, threadMessage);
    }
  };

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    }
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
    updateCachedItemText(id, clean);
    updateHistoryMessage(id, clean);
    if (activeConversationId) {
      updateConversationMessage(activeConversationId, id, clean);
    }
  };

  const applyMessageDelete = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setDisplayed((prev) => prev.filter((m) => m.id !== id));
    deleteCachedItem(id);
    deleteHistoryMessage(id);
    if (activeConversationId) {
      deleteConversationMessage(activeConversationId, id);
    }
  };

  const promptMessageAction = (msg: Message) => {
    if (msg.role !== "user") return;
    const action = window.prompt("Type E to edit or D to delete this message:", "E");
    if (!action) return;
    const normalized = action.trim().toLowerCase();
    if (normalized === "d") {
      if (window.confirm("Delete this message?")) {
        applyMessageDelete(msg.id);
      }
      return;
    }
    if (normalized === "e") {
      const nextText = window.prompt("Edit your message:", msg.text);
      if (nextText !== null) {
        applyMessageEdit(msg.id, nextText);
      }
    }
  };

  const startLongPress = (msg: Message) => {
    if (msg.role !== "user") return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      promptMessageAction(msg);
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
            <div key={`t-${idx++}`} style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {before}
            </div>
          );
        }
      }
      const lang = (m[1] || "text").trim();
      const code = m[2] || "";
      nodes.push(
        <div key={`c-${idx++}`} style={{ marginTop: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.25rem 0.4rem",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderBottom: "none",
              borderRadius: "8px 8px 0 0",
              background: "rgba(15, 23, 42, 0.85)",
              fontSize: "0.72rem",
              color: "#cbd5e1",
            }}
          >
            <span>{lang}</span>
            <button
              onClick={() => copyText(code)}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.3)",
                background: "transparent",
                color: "#e2e8f0",
                borderRadius: 6,
                padding: "0.1rem 0.45rem",
                cursor: "pointer",
              }}
            >
              Copy
            </button>
          </div>
          <SyntaxHighlighter language={lang} style={okaidia} showLineNumbers>
            {code}
          </SyntaxHighlighter>
        </div>
      );
      lastIndex = regex.lastIndex;
    }
    const tail = text.slice(lastIndex).trim();
    if (tail) {
      nodes.push(
        <div key={`t-${idx++}`} style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {tail}
        </div>
      );
    }
    return nodes.length ? nodes : [<div key="empty" />];
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    const bubbleStyle: React.CSSProperties = isUser
      ? {
          marginLeft: "auto",
          maxWidth: "78%",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
          color: "#f8fafc",
          borderRadius: "16px 16px 4px 16px",
          padding: "0.65rem 0.85rem",
          boxShadow: "0 8px 22px rgba(37, 99, 235, 0.25)",
        }
      : {
          marginRight: "auto",
          maxWidth: "86%",
          background: "rgba(15, 23, 42, 0.78)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          color: "#e2e8f0",
          borderRadius: "16px 16px 16px 4px",
          padding: "0.65rem 0.85rem",
          boxShadow: "0 8px 22px rgba(15, 23, 42, 0.28)",
        };

    const showActions = msg.role === "assistant";
    const previousUserText = (() => {
      const idx = messages.findIndex((m) => m.id === msg.id);
      if (idx <= 0) return "";
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i].role === "user") return messages[i].text;
      }
      return "";
    })();

    return (
      <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginBottom: "0.7rem" }}>
        <div
          style={{
            fontSize: "0.72rem",
            color: "var(--ne-muted)",
            marginLeft: isUser ? "auto" : 0,
            marginRight: isUser ? 0 : "auto",
          }}
        >
          {isUser ? "You" : "NeuroEdge"}
        </div>
        <div
          style={bubbleStyle}
          onDoubleClick={() => promptMessageAction(msg)}
          onTouchStart={() => startLongPress(msg)}
          onTouchEnd={endLongPress}
          onTouchCancel={endLongPress}
        >
          {renderRichText(msg.text)}
        </div>
        {showActions && (
          <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.12rem" }}>
            <button
              onClick={() => copyText(msg.text)}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              Copy
            </button>
            <button
              onClick={() =>
                orchestrator.submitTrainingFeedback({
                  query: previousUserText,
                  response: msg.text,
                  rating: "up",
                })
              }
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              👍
            </button>
            <button
              onClick={() =>
                orchestrator.submitTrainingFeedback({
                  query: previousUserText,
                  response: msg.text,
                  rating: "down",
                })
              }
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              👎
            </button>
          </div>
        )}
      </div>
    );
  };

  // --- Render ---
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", color: "#e2e8f0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          padding: "0.55rem 0.85rem",
          borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
          background: "rgba(15, 23, 42, 0.66)",
        }}
      >
        <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
          Active Chat: <span style={{ color: "#e2e8f0" }}>{activeConversationId ? "Saved thread" : "Unsaved"}</span>
        </div>
        <div style={{ display: "flex", gap: "0.45rem" }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "my_chats" }))}
            style={{
              border: "1px solid rgba(148,163,184,0.35)",
              background: "transparent",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: "0.28rem 0.55rem",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            My Chats
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:newChat"))}
            style={{
              border: "none",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              padding: "0.28rem 0.55rem",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            New Chat
          </button>
        </div>
      </div>
      <div
        id="chatScroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          background: "transparent",
        }}
      >
        <InfiniteScroll
          dataLength={displayed.length}
          next={fetchMore}
          hasMore={displayed.length < messages.length}
          inverse
          scrollableTarget="chatScroll"
          loader={<div style={{ textAlign: "center", color: "#94a3b8" }}>Loading…</div>}
        >
          {displayed.map(renderMessage)}
        </InfiniteScroll>
        <div ref={messageEndRef} />
      </div>

      {/* Input + AI Suggestions */}
      <div
        style={{
          position: "relative",
          display: "flex",
          padding: "0.6rem",
          background: "rgba(15, 23, 42, 0.9)",
          borderTop: "1px solid rgba(148, 163, 184, 0.2)",
        }}
      >
        <AISuggestionOverlay suggestions={suggestions} onAccept={acceptSuggestion} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleSend();
            if (e.key === "Tab" && suggestions.length) { e.preventDefault(); acceptSuggestion(suggestions[0]); }
            if (e.key === "Escape") setSuggestions([]);
          }}
          placeholder="Ask, debug, code, research…"
          style={{
            flex: 1,
            padding: "0.6rem 0.75rem",
            background: "rgba(15, 23, 42, 0.6)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.3)",
            borderRadius: 8,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            marginLeft: "0.5rem",
            padding: "0.55rem 1rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default MainChat;
