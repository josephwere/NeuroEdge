// frontend/src/services/offlineCache.ts
export interface CachedItem {
  id: string;
  timestamp: number;
  type: "chat" | "command" | "ai";
  payload: any;
}

const STORAGE_KEY = "neuroedge_cache";

export const saveToCache = (item: CachedItem) => {
  const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as CachedItem[];
  cached.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
};

export const getCache = (): CachedItem[] => {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as CachedItem[];
};

export const clearCache = () => localStorage.removeItem(STORAGE_KEY);
