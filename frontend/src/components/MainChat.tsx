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
  replaceConversationMessages,
  setActiveConversation,
  updateConversationMessage,
  deleteConversationMessage,
  createConversation,
} from "@/services/conversationStore";
import { confirmSafeAction } from "@/services/safetyPrompts";
import { extractVisibleText, fillFormFieldsFromSpec } from "@/services/localAutomation";
import {
  loadEffectiveChatBranding,
  userCustomizationUpdateEventName,
} from "@/services/userCustomization";

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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, string>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const longPressTimer = useRef<number | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isSending, setIsSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const sendRunRef = useRef(0);
  const [recordingDraft, setRecordingDraft] = useState("");
  const recordingDraftRef = useRef("");
  const [listenSeq, setListenSeq] = useState(0);
  const [brainstormMode, setBrainstormMode] = useState(false);
  const [branding, setBranding] = useState(() => loadEffectiveChatBranding());

  useEffect(() => {
    const refreshBranding = () => setBranding(loadEffectiveChatBranding());
    window.addEventListener("neuroedge:brandingUpdated", refreshBranding as EventListener);
    window.addEventListener(
      userCustomizationUpdateEventName(),
      refreshBranding as EventListener
    );
    window.addEventListener("storage", refreshBranding);
    return () => {
      window.removeEventListener("neuroedge:brandingUpdated", refreshBranding as EventListener);
      window.removeEventListener(
        userCustomizationUpdateEventName(),
        refreshBranding as EventListener
      );
      window.removeEventListener("storage", refreshBranding);
    };
  }, []);

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
    if (logs.length > 0) setBrainstormMode(false);
  };

  useEffect(() => {
    importLegacyCacheOnce();
    const active = ensureActiveConversation();
    loadConversation(active.id);
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
  const executeWithContext = async (userInput: string, contextMessages: Message[], runId: number) => {
    try {
      const currentContext = contextMessages.map((m) => ({
        role: m.role,
        content: m.text,
      }));
      const res = await orchestrator.execute({
        command: userInput,
        context: currentContext.slice(-25),
      });
      if (runId !== sendRunRef.current) return;

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
      if (runId !== sendRunRef.current) return;
      addMessage(`❌ Error: ${err.message || err}`, "error");
    } finally {
      if (runId === sendRunRef.current) setIsSending(false);
    }
  };

  const sendText = async (text: string) => {
    if (!text.trim() || isSending) return;
    setSuggestions([]);
    setIsSending(true);
    const runId = Date.now();
    sendRunRef.current = runId;

    const id = Date.now().toString();
    const userMsg: Message = { id, role: "user", text, type: "info" };
    setMessages(m => [...m, userMsg]);
    setDisplayed(d => [...d, userMsg]);
    chatContext.add({ role: "user", content: text });
    addHistoryMessage({ id, role: "user", text, type: "info" });
    if (activeConversationId) {
      appendConversationMessage(activeConversationId, {
        id,
        role: "user",
        text,
        type: "info",
        timestamp: Date.now(),
      });
    }

    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { role: "user", text, type: "info" } });
    setInput("");
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("/extract-text")) {
      const pageText = extractVisibleText();
      if (!pageText) addMessage("⚠️ No visible page text found.", "warn");
      else {
        addMessage("✅ Extracted visible page text (preview):", "info");
        addMessage(`\`\`\`text\n${pageText}\n\`\`\``, "info");
      }
      setIsSending(false);
      return;
    }
    if (lower.startsWith("/fill-form")) {
      const spec = trimmed.replace(/^\/fill-form\s*/i, "");
      const r = fillFormFieldsFromSpec(spec);
      addMessage(
        r.missing.length
          ? `✅ Filled ${r.filled} field(s). Missing: ${r.missing.join(", ")}`
          : `✅ Filled ${r.filled} field(s).`,
        r.missing.length ? "warn" : "info"
      );
      setIsSending(false);
      return;
    }
    const outbound = brainstormMode && !lower.startsWith("/brainstorm")
      ? `/brainstorm ${trimmed}`
      : trimmed;
    if (brainstormMode) setBrainstormMode(false);
    await executeWithContext(outbound, [...messages, userMsg], runId);
  };

  const handleSend = async () => {
    await sendText(input);
  };

  const startBrainstormChat = () => {
    const hasMessages = messages.length > 0;
    if (hasMessages) {
      window.dispatchEvent(new CustomEvent("neuroedge:newChat"));
    }
    setBrainstormMode(true);
    setInput((prev) => (prev.trim() ? prev : ""));
  };

  const cancelSend = () => {
    sendRunRef.current = Date.now() + 1;
    setIsSending(false);
    addMessage("⛔ Request canceled by user.", "warn");
  };

  // --- Helpers ---
  const normalizeAssistantText = (raw: string) => {
    const trimmed = raw.trim();
    const match = trimmed.match(/^```(\w+)?\n([\s\S]*?)```$/);
    if (!match) return raw;
    const lang = (match[1] || "").toLowerCase();
    const body = (match[2] || "").trim();
    const looksLikeCode = /[{}();=<>\[\]]|(^\s*(const|let|var|def|class|function|import|export)\s)/m.test(
      body
    );
    if (looksLikeCode) return raw;
    if (!lang || lang === "text" || lang === "md" || lang === "markdown") return body;
    return raw;
  };

  const addMessage = (text: string, type?: Message["type"], codeLanguage?: string, isCode?: boolean) => {
    const id = Date.now().toString() + Math.random();
    const safeText = normalizeAssistantText(text);
    const msg: Message = {
      id,
      text: safeText,
      type,
      isCode,
      codeLanguage,
      collapsible: isCode,
      collapsibleOpen: true,
      role: "assistant",
      timestamp: Date.now(),
    };
    setMessages(m => [...m, msg]);
    setDisplayed(d => [...d, msg]);
    saveToCache({ id, timestamp: Date.now(), type: "chat", payload: { role: "assistant", text: safeText, type, codeLanguage, isCode } });
    addHistoryMessage({ id, role: "assistant", text: safeText, type, isCode, codeLanguage });
    if (activeConversationId) {
      const threadMessage: ConversationMessage = {
        id,
        role: "assistant",
        text: safeText,
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

  const persistThreadSlice = (nextMessages: Message[]) => {
    if (!activeConversationId) return;
    replaceConversationMessages(
      activeConversationId,
      nextMessages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        type: m.type,
        isCode: m.isCode,
        codeLanguage: m.codeLanguage,
        timestamp: m.timestamp || Date.now(),
      }))
    );
  };

  const truncateFromMessage = (id: string, includeTarget: boolean): Message[] => {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return messages;
    const cut = includeTarget ? idx : idx + 1;
    const removed = messages.slice(cut);
    removed.forEach((m) => {
      deleteCachedItem(m.id);
      deleteHistoryMessage(m.id);
    });
    const kept = messages.slice(0, cut);
    setMessages(kept);
    setDisplayed(kept.slice(-Math.max(PAGE_SIZE, kept.length)));
    setPage(1);
    syncContextFromMessages(kept);
    persistThreadSlice(kept);
    return kept;
  };

  const applyMessageEdit = (id: string, nextText: string): Message[] | null => {
    const clean = nextText.trim();
    if (!clean) return null;
    const truncated = truncateFromMessage(id, false);
    const updated = truncated.map((m) => (m.id === id ? { ...m, text: clean } : m));
    setMessages(updated);
    setDisplayed(updated.slice(-Math.max(PAGE_SIZE, updated.length)));
    syncContextFromMessages(updated);
    persistThreadSlice(updated);
    updateCachedItemText(id, clean);
    updateHistoryMessage(id, clean);
    if (activeConversationId) updateConversationMessage(activeConversationId, id, clean);
    return updated;
  };

  const applyMessageDelete = (id: string) => {
    truncateFromMessage(id, true);
    if (activeConversationId) deleteConversationMessage(activeConversationId, id);
  };

  const promptMessageAction = (msg: Message) => {
    if (msg.role !== "user") return;
    const action = window.prompt("Type E to edit or D to delete this message:", "E");
    if (!action) return;
    const normalized = action.trim().toLowerCase();
    if (normalized === "d") {
      if (confirmSafeAction({ title: "chat message", actionLabel: "delete", chatMode: true })) {
        applyMessageDelete(msg.id);
      }
      return;
    }
    if (normalized === "e") {
      setEditingMessageId(msg.id);
      setEditingDraft(msg.text);
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

  const sendReaction = async (
    msg: Message,
    previousUserText: string,
    reaction: "up" | "down" | "laugh" | "sad"
  ) => {
    const mappedRating: "up" | "down" | "neutral" =
      reaction === "up" ? "up" : reaction === "down" ? "down" : "neutral";
    const tags = [`reaction:${reaction}`];
    if (reaction === "laugh") tags.push("sentiment:positive");
    if (reaction === "sad") tags.push("sentiment:negative");

    try {
      await orchestrator.submitTrainingFeedback({
        query: previousUserText || "",
        response: msg.text,
        rating: mappedRating,
        tags,
      });
      setReactionsByMessage((prev) => ({ ...prev, [msg.id]: reaction }));
    } catch {
      setReactionsByMessage((prev) => ({ ...prev, [msg.id]: "error" }));
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

  const renderInlineCode = (line: string) => {
    const chunks = line.split(/(`[^`]+`)/g);
    return chunks.map((c, i) =>
      c.startsWith("`") && c.endsWith("`") ? (
        <code
          key={`ic-${i}`}
          style={{
            background: "rgba(148,163,184,0.2)",
            padding: "0.05rem 0.28rem",
            borderRadius: 5,
            fontSize: "0.86em",
          }}
        >
          {c.slice(1, -1)}
        </code>
      ) : (
        <React.Fragment key={`tx-${i}`}>{c}</React.Fragment>
      )
    );
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
              {before.split("\n").map((line, i) => (
                <div key={`ln-${idx}-${i}`}>{renderInlineCode(line)}</div>
              ))}
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
          {tail.split("\n").map((line, i) => (
            <div key={`lnf-${idx}-${i}`}>{renderInlineCode(line)}</div>
          ))}
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
    const isEditingThisUserMessage =
      msg.role === "user" && editingMessageId === msg.id;
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
          {isEditingThisUserMessage ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <textarea
                value={editingDraft}
                onChange={(e) => setEditingDraft(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  resize: "vertical",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#f8fafc",
                  padding: "0.55rem 0.65rem",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
                <button
                  onClick={() => {
                    setEditingMessageId(null);
                    setEditingDraft("");
                  }}
                  style={{
                    border: "1px solid rgba(255,255,255,0.38)",
                    background: "transparent",
                    color: "#f8fafc",
                    borderRadius: 8,
                    padding: "0.25rem 0.55rem",
                    cursor: "pointer",
                    fontSize: "0.74rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const updated = applyMessageEdit(msg.id, editingDraft);
                    setEditingMessageId(null);
                    setEditingDraft("");
                    if (!updated) return;
                    const edited = updated.find((m) => m.id === msg.id);
                    if (!edited) return;
                    await executeWithContext(edited.text, updated);
                  }}
                  style={{
                    border: "none",
                    background: "#22c55e",
                    color: "#06240f",
                    borderRadius: 8,
                    padding: "0.25rem 0.55rem",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "0.74rem",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            renderRichText(msg.text)
          )}
        </div>
        {showActions && (
          <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.12rem" }}>
            <button
              onClick={async () => {
                await copyText(msg.text);
                setCopiedMessageId(msg.id);
                window.setTimeout(() => {
                  setCopiedMessageId((v) => (v === msg.id ? null : v));
                }, 1600);
              }}
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
              {copiedMessageId === msg.id ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => sendReaction(msg, previousUserText, "up")}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background:
                  reactionsByMessage[msg.id] === "up"
                    ? "rgba(34,197,94,0.25)"
                    : "rgba(15, 23, 42, 0.75)",
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
              onClick={() => sendReaction(msg, previousUserText, "down")}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background:
                  reactionsByMessage[msg.id] === "down"
                    ? "rgba(239,68,68,0.25)"
                    : "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              👎
            </button>
            <button
              onClick={() => sendReaction(msg, previousUserText, "laugh")}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background:
                  reactionsByMessage[msg.id] === "laugh"
                    ? "rgba(59,130,246,0.28)"
                    : "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
              title="Funny / liked tone"
            >
              😂
            </button>
            <button
              onClick={() => sendReaction(msg, previousUserText, "sad")}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background:
                  reactionsByMessage[msg.id] === "sad"
                    ? "rgba(168,85,247,0.28)"
                    : "rgba(15, 23, 42, 0.75)",
                color: "#cbd5e1",
                borderRadius: 8,
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
              title="Not helpful / disappointing"
            >
              😢
            </button>
            {reactionsByMessage[msg.id] === "error" && (
              <span style={{ fontSize: "0.7rem", color: "#fca5a5", alignSelf: "center" }}>
                reaction failed
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // --- Render ---
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: "#e2e8f0",
        backgroundImage: branding.mainChatBackgroundUrl
          ? `linear-gradient(rgba(2,6,23,${branding.mainChatOverlayOpacity}), rgba(2,6,23,${branding.mainChatOverlayOpacity})), url(${branding.mainChatBackgroundUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
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
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={branding.mainChatIconUrl || "/icon.png"}
            alt="Main chat icon"
            style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover" }}
          />
          <span>
            Active Chat:{" "}
            <span style={{ color: "#e2e8f0" }}>
              {activeConversationId ? "Saved thread" : "Unsaved"}
            </span>
          </span>
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
              background: branding.accentColor || "#2563eb",
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
          alignItems: "center",
          justifyContent: "center",
          padding: "0.6rem",
          background: "rgba(15, 23, 42, 0.9)",
          borderTop: "1px solid rgba(148, 163, 184, 0.2)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDropFiles}
      >
        <div style={{
          width: "min(920px, 100%)",
          border: dragActive ? "1px solid #38bdf8" : "1px solid rgba(148,163,184,0.3)",
          borderRadius: 14,
          background: "rgba(15,23,42,0.78)",
          padding: "0.45rem",
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          boxShadow: dragActive ? "0 0 0 2px rgba(56,189,248,0.25)" : "none",
        }}>
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
            style={{
              padding: "0.55rem 0.7rem",
              background: "#0ea5e9",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
            title="Upload files (or drag and drop)"
          >
            +
          </button>
          {messages.length === 0 && (
            <button
              onClick={startBrainstormChat}
              style={{
                padding: "0.46rem 0.62rem",
                background: brainstormMode ? "rgba(59,130,246,0.35)" : "rgba(15,23,42,0.78)",
                color: "#e2e8f0",
                border: "1px solid rgba(148,163,184,0.28)",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
              title="Start brainstorm chat"
            >
              🧠
            </button>
          )}
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleSend();
                if (e.key === "Tab" && suggestions.length) { e.preventDefault(); acceptSuggestion(suggestions[0]); }
                if (e.key === "Escape") setSuggestions([]);
              }}
              placeholder={brainstormMode ? "Brainstorm ideas, strategy, roadmap..." : "Message NeuroEdge..."}
              style={{
                width: "100%",
                padding: "0.64rem 8.6rem 0.64rem 0.75rem",
                background: "rgba(15, 23, 42, 0.4)",
                color: isListening ? "transparent" : "#e2e8f0",
                caretColor: isListening ? "transparent" : "#e2e8f0",
                border: "none",
                borderRadius: 10,
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
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: "transparent",
                    color: "#e2e8f0",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "1.1rem",
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
                  inset: "0.18rem 0.5rem",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                  opacity: 0.9,
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", marginRight: 6 }}>Listening</span>
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
                  {Array.from({ length: 56 }).map((_, i) => (
                    <span
                      key={`mw-${i}`}
                      style={{
                        width: 3,
                      marginRight: 2,
                      height: 8 + (i % 4) * 4,
                        borderRadius: 3,
                        background: "rgba(148,163,184,0.72)",
                        animation: `neWave 1s ${i * 0.04}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={isSending ? cancelSend : handleSend}
            style={{
              width: 44,
              height: 44,
              background: isSending ? "#dc2626" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "1.3rem",
              display: "grid",
              placeItems: "center",
              animation: isSending ? "neSpin 1s linear infinite" : "none",
            }}
            title={isSending ? "Cancel" : "Send"}
          >
            {isSending ? "■" : "↑"}
          </button>
        </div>
      </div>
      <style>{`@keyframes neSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes neWave { 0%,100%{ transform: scaleY(0.45); opacity:0.45;} 50%{ transform: scaleY(1); opacity:1;} } @keyframes neFill { from { width: 0%; } to { width: 100%; } }`}</style>
    </div>
  );
};

export default MainChat;

const inlineRoundBtn = (bg: string, color: string, border = "none"): React.CSSProperties => ({
  width: 30,
  height: 30,
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
