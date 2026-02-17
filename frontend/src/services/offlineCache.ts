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

export const updateCachedItemText = (id: string, nextText: string) => {
  const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as CachedItem[];
  const updated = cached.map((item) =>
    item.id === id ? { ...item, payload: { ...(item.payload || {}), text: nextText } } : item
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const deleteCachedItem = (id: string) => {
  const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as CachedItem[];
  const updated = cached.filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
