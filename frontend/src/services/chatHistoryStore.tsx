// frontend/src/services/chatHistoryStore.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

/* ===================== TYPES ===================== */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  type?: "info" | "warn" | "error" | "ml" | "mesh";
  isCode?: boolean;
  codeLanguage?: string;
  collapsible?: boolean;
  collapsibleOpen?: boolean;
  timestamp: number;
  tags?: string[];
}

export interface Filters {
  role?: "user" | "assistant" | "system";
  type?: string;
  fromDate?: number;
  toDate?: number;
  tags?: string[];
}

interface ChatHistoryContextValue {
  messages: ChatMessage[];
  allMessages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void;
  loadMore: () => void;
  setSearchQuery: (query: string, filters?: Filters) => void;
  replayMessage: (id: string) => void;
  resetHistory: () => void;

  // Replay controls
  replayIndex: number;
  startReplay: () => void;
  stepReplay: () => void;
  resetReplay: () => void;

  // Import/export
  importHistory: (messages: ChatMessage[]) => void;
}

/* ===================== CONTEXT ===================== */

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null);

/* ===================== PROVIDER ===================== */

export const ChatHistoryProvider = ({ children }: { children: ReactNode }) => {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("chat_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [visibleCount, setVisibleCount] = useState(50);
  const [searchQuery, setSearchQueryState] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [replayIndex, setReplayIndex] = useState(-1);

  /* ---------- Derived state ---------- */

  const filteredMessages = allMessages
    .filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(m => (!filters.role || m.role === filters.role))
    .filter(m => (!filters.type || m.type === filters.type))
    .filter(m => (!filters.fromDate || m.timestamp >= filters.fromDate))
    .filter(m => (!filters.toDate || m.timestamp <= filters.toDate))
    .filter(m => (!filters.tags || filters.tags.every(t => m.tags?.includes(t))));

  const messages = filteredMessages.slice(0, visibleCount);

  /* ---------- Actions ---------- */

  const addMessage = (msg: Omit<ChatMessage, "timestamp">) => {
    setAllMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const loadMore = () => setVisibleCount(v => v + 50);

  const setSearchQuery = (query: string, applied?: Filters) => {
    setSearchQueryState(query);
    if (applied) setFilters(applied);
    setVisibleCount(50);
  };

  const replayMessage = (id: string) => {
    const msg = allMessages.find(m => m.id === id);
    if (msg) {
      console.log("Replay:", msg);
    }
  };

  const resetHistory = () => {
    setAllMessages([]);
    setVisibleCount(50);
    setSearchQueryState("");
    setFilters({});
    setReplayIndex(-1);
    localStorage.removeItem("chat_history");
  };

  /* ---------- Replay ---------- */

  const startReplay = () => setReplayIndex(0);
  const stepReplay = () =>
    setReplayIndex(i => Math.min(i + 1, allMessages.length - 1));
  const resetReplay = () => setReplayIndex(-1);

  const importHistory = (msgs: ChatMessage[]) => {
    setAllMessages(msgs);
    setReplayIndex(-1);
  };

  /* ---------- Persistence ---------- */

  useEffect(() => {
    localStorage.setItem("chat_history", JSON.stringify(allMessages));
  }, [allMessages]);

  return (
    <ChatHistoryContext.Provider
      value={{
        messages,
        allMessages,
        addMessage,
        loadMore,
        setSearchQuery,
        replayMessage,
        resetHistory,
        replayIndex,
        startReplay,
        stepReplay,
        resetReplay,
        importHistory,
      }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
};

/* ===================== HOOK ===================== */

export const useChatHistory = () => {
  const ctx = useContext(ChatHistoryContext);
  if (!ctx) {
    throw new Error("useChatHistory must be used inside ChatHistoryProvider");
  }
  return ctx;
};
