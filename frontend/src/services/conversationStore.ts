export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  text: string;
  type?: "info" | "warn" | "error" | "ml" | "mesh";
  isCode?: boolean;
  codeLanguage?: string;
  timestamp: number;
}

export interface ConversationThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
}

const THREADS_KEY = "neuroedge_conversations_v1";
const ACTIVE_KEY = "neuroedge_active_conversation_id";
const LEGACY_IMPORTED_KEY = "neuroedge_conversation_legacy_imported_v1";

const now = () => Date.now();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readThreads = (): ConversationThread[] => {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConversationThread[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const writeThreads = (threads: ConversationThread[]) => {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
};

const emitThreadsChanged = () => {
  window.dispatchEvent(new CustomEvent("neuroedge:conversationsUpdated"));
};

export const listConversations = (): ConversationThread[] => {
  return readThreads().sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getConversation = (id: string): ConversationThread | undefined => {
  return readThreads().find((t) => t.id === id);
};

export const getActiveConversationId = (): string | null => {
  return localStorage.getItem(ACTIVE_KEY);
};

export const setActiveConversation = (id: string) => {
  localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(
    new CustomEvent("neuroedge:activeConversationChanged", { detail: { id } })
  );
};

export const createConversation = (title = "New Chat"): ConversationThread => {
  const thread: ConversationThread = {
    id: uid(),
    title,
    createdAt: now(),
    updatedAt: now(),
    messages: [],
  };
  const next = [thread, ...readThreads()];
  writeThreads(next);
  setActiveConversation(thread.id);
  emitThreadsChanged();
  return thread;
};

export const ensureActiveConversation = (): ConversationThread => {
  const activeId = getActiveConversationId();
  if (activeId) {
    const active = getConversation(activeId);
    if (active) return active;
  }
  const existing = listConversations()[0];
  if (existing) {
    setActiveConversation(existing.id);
    return existing;
  }
  return createConversation();
};

export const replaceConversationMessages = (
  conversationId: string,
  messages: ConversationMessage[]
) => {
  const next = readThreads().map((t) =>
    t.id === conversationId
      ? { ...t, messages, updatedAt: now() }
      : t
  );
  writeThreads(next);
  emitThreadsChanged();
};

export const appendConversationMessage = (
  conversationId: string,
  message: ConversationMessage
) => {
  const next = readThreads().map((t) => {
    if (t.id !== conversationId) return t;
    const updatedMessages = [...t.messages, message];
    const shouldRename =
      t.title === "New Chat" &&
      message.role === "user" &&
      message.text.trim().length > 0;
    const renamedTitle = shouldRename
      ? message.text.trim().slice(0, 42)
      : t.title;
    return {
      ...t,
      title: renamedTitle,
      messages: updatedMessages,
      updatedAt: now(),
    };
  });
  writeThreads(next);
  emitThreadsChanged();
};

export const renameConversation = (conversationId: string, title: string) => {
  const clean = title.trim();
  if (!clean) return;
  const next = readThreads().map((t) =>
    t.id === conversationId ? { ...t, title: clean, updatedAt: now() } : t
  );
  writeThreads(next);
  emitThreadsChanged();
};

export const updateConversationMessage = (
  conversationId: string,
  messageId: string,
  nextText: string
) => {
  const clean = nextText.trim();
  if (!clean) return;
  const next = readThreads().map((t) => {
    if (t.id !== conversationId) return t;
    return {
      ...t,
      messages: t.messages.map((m) =>
        m.id === messageId ? { ...m, text: clean } : m
      ),
      updatedAt: now(),
    };
  });
  writeThreads(next);
  emitThreadsChanged();
};

export const deleteConversationMessage = (
  conversationId: string,
  messageId: string
) => {
  const next = readThreads().map((t) => {
    if (t.id !== conversationId) return t;
    return {
      ...t,
      messages: t.messages.filter((m) => m.id !== messageId),
      updatedAt: now(),
    };
  });
  writeThreads(next);
  emitThreadsChanged();
};

export const deleteConversation = (conversationId: string) => {
  const filtered = readThreads().filter((t) => t.id !== conversationId);
  writeThreads(filtered);
  const activeId = getActiveConversationId();
  if (activeId === conversationId) {
    const fallback = filtered[0] ?? createConversation();
    setActiveConversation(fallback.id);
  }
  emitThreadsChanged();
};

export const importLegacyCacheOnce = () => {
  const already = localStorage.getItem(LEGACY_IMPORTED_KEY) === "1";
  if (already) return;
  const threads = readThreads();
  if (threads.length > 0) {
    localStorage.setItem(LEGACY_IMPORTED_KEY, "1");
    return;
  }

  let legacyRaw = "[]";
  try {
    legacyRaw = localStorage.getItem("neuroedge_cache") || "[]";
  } catch {
    legacyRaw = "[]";
  }
  const legacy = JSON.parse(legacyRaw) as Array<{
    id: string;
    timestamp: number;
    type: string;
    payload: { role?: ConversationRole; text?: string; type?: string; isCode?: boolean; codeLanguage?: string };
  }>;
  const messages = legacy
    .filter((i) => i.type === "chat" && i.payload?.text)
    .map((i) => ({
      id: i.id,
      role: i.payload.role || "assistant",
      text: i.payload.text || "",
      type: i.payload.type as ConversationMessage["type"],
      isCode: Boolean(i.payload.isCode),
      codeLanguage: i.payload.codeLanguage,
      timestamp: i.timestamp || now(),
    }));

  if (messages.length > 0) {
    const imported: ConversationThread = {
      id: uid(),
      title: "Imported Chat",
      createdAt: messages[0].timestamp,
      updatedAt: messages[messages.length - 1].timestamp,
      messages,
    };
    writeThreads([imported]);
    setActiveConversation(imported.id);
    emitThreadsChanged();
  }

  localStorage.setItem(LEGACY_IMPORTED_KEY, "1");
};
