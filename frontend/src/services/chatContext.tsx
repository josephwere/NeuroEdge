import React, { createContext, useContext, useState, useEffect } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

class ChatContextClass {
  private messages: ChatMessage[] = [];

  add(message: ChatMessage) {
    this.messages.push(message);
    localStorage.setItem("neuroedge_chat_context", JSON.stringify(this.messages));
  }

  load() {
    const saved = localStorage.getItem("neuroedge_chat_context");
    if (saved) this.messages = JSON.parse(saved);
  }

  getAll() {
    return this.messages;
  }

  clear() {
    this.messages = [];
    localStorage.removeItem("neuroedge_chat_context");
  }
}

export const chatContext = new ChatContextClass();
chatContext.load();

// ------------------------
// React wrapper
// ------------------------
interface ChatProviderProps {
  children: React.ReactNode;
}

interface ChatContextValue {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

const ChatReactContext = createContext<ChatContextValue | null>(null);

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(chatContext.getAll());

  const addMessage = (msg: ChatMessage) => {
    chatContext.add(msg);
    setMessages([...chatContext.getAll()]);
  };

  const clearMessages = () => {
    chatContext.clear();
    setMessages([]);
  };

  // keep state in sync on mount
  useEffect(() => {
    setMessages(chatContext.getAll());
  }, []);

  return (
    <ChatReactContext.Provider value={{ messages, addMessage, clearMessages }}>
      {children}
    </ChatReactContext.Provider>
  );
};

export const useChatContext = () => {
  const ctx = useContext(ChatReactContext);
  if (!ctx) throw new Error("useChatContext must be used inside ChatProvider");
  return ctx;
};
