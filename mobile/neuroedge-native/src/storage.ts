import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppConfig, ChatThread } from "./types";

const THREADS_KEY = "neuroedge.native.threads.v1";
const ACTIVE_THREAD_KEY = "neuroedge.native.activeThreadId.v1";
const CONFIG_KEY = "neuroedge.native.config.v1";

export const defaultConfig: AppConfig = {
  orchestratorUrl: "http://10.0.2.2:7070",
  apiKey: "",
  bearerToken: "",
  orgId: "personal",
  workspaceId: "default",
  userRole: "guest",
  userPlan: "free",
  userEmail: "",
  userName: "Guest User",
  kernelId: "local",
  style: "balanced",
};

export async function loadThreads(): Promise<ChatThread[]> {
  const raw = await AsyncStorage.getItem(THREADS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveThreads(threads: ChatThread[]): Promise<void> {
  await AsyncStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

export async function loadActiveThreadId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_THREAD_KEY);
}

export async function saveActiveThreadId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_THREAD_KEY, id);
}

export async function loadConfig(): Promise<AppConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return defaultConfig;
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...(parsed || {}) };
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
