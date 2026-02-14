// frontend/src/services/aiPreferencesStore.ts
import { createContext, useContext, useState, ReactNode } from "react";

export type AIPreferences = {
  temperature: number;         // randomness 0.0–1.0
  verbosity: "low" | "medium" | "high"; 
  codeFormatting: boolean;     // pretty-print code blocks
  explanationDepth: number;    // 1–5 scale
  safetyStrictness: "low" | "medium" | "high"; // doctrine enforcement
};

const defaultPreferences: AIPreferences = {
  temperature: 0.7,
  verbosity: "medium",
  codeFormatting: true,
  explanationDepth: 3,
  safetyStrictness: "high",
};

type AIContextType = {
  preferences: AIPreferences;
  setPreferences: (prefs: Partial<AIPreferences>) => void;
};

const AIContext = createContext<AIContextType | null>(null);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [preferences, setPreferencesState] = useState<AIPreferences>(defaultPreferences);

  const setPreferences = (prefs: Partial<AIPreferences>) => {
    setPreferencesState(prev => ({ ...prev, ...prefs }));
  };

  return (
    <AIContext.Provider value={{ preferences, setPreferences }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAIPreferences = () => {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAIPreferences must be used within AIProvider");
  return ctx;
};
