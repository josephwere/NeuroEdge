// frontend/src/services/aiSuggestionsStore.ts
import React, { createContext, useContext, useState } from "react";

export interface AISuggestion {
  id: string;
  text: string;
  type?: "command" | "completion" | "insight";
  action?: () => void;
}

interface AISuggestionsContextType {
  suggestions: AISuggestion[];
  setSuggestions: (s: AISuggestion[]) => void;
  clearSuggestions: () => void;
}

const AISuggestionsContext = createContext<AISuggestionsContextType | null>(null);

export const AISuggestionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [suggestions, setSuggestionsState] = useState<AISuggestion[]>([]);

  const setSuggestions = (s: AISuggestion[]) => setSuggestionsState(s);
  const clearSuggestions = () => setSuggestionsState([]);

  return (
    <AISuggestionsContext.Provider value={{ suggestions, setSuggestions, clearSuggestions }}>
      {children}
    </AISuggestionsContext.Provider>
  );
};

export const useAISuggestions = () => {
  const ctx = useContext(AISuggestionsContext);
  if (!ctx) throw new Error("useAISuggestions must be used inside AISuggestionsProvider");
  return ctx;
};
