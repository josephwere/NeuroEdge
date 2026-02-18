import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NeuroEdgeTwinActionPump } from "@neuroedge/react-native-twin";
import {
  askAssistant,
  checkMobileVersion,
  fetchFounderAdminParity,
  fetchRemoteConfig,
  health,
  postJson,
} from "./api";
import {
  defaultConfig,
  loadActiveThreadId,
  loadConfig,
  loadThreads,
  saveActiveThreadId,
  saveConfig,
  saveThreads,
} from "./storage";
import { AppConfig, ChatMessage, ChatThread, MobileRemoteConfig, UserRole } from "./types";

type Page =
  | "main_chat"
  | "floating_chat"
  | "my_chats"
  | "projects"
  | "history"
  | "extensions"
  | "dashboard"
  | "settings";
const APP_VERSION = "1.0.0";

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

function newThread(title = "New Chat"): ChatThread {
  const now = Date.now();
  return { id: id("thread"), title, createdAt: now, updatedAt: now, messages: [] };
}

function clipTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New Chat";
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
}

function buildPumpConfig(config: AppConfig) {
  return {
    baseUrl: config.orchestratorUrl,
    headers: {
      apiKey: config.apiKey,
      bearerToken: config.bearerToken,
      orgId: config.orgId,
      workspaceId: config.workspaceId,
      userRole: config.userRole,
      userEmail: config.userEmail,
      userName: config.userName,
    },
    device: {
      id: `${Platform.OS}-native-${Platform.Version}`,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: `NeuroEdge ${Platform.OS}`,
      appVersion: APP_VERSION,
      osVersion: String(Platform.Version),
      attestationProvider: Platform.OS === "ios" ? "ios_devicecheck" : "android_play_integrity",
      attestationStatus: "trusted" as const,
    },
  };
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>("main_chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [remoteConfig, setRemoteConfig] = useState<MobileRemoteConfig | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [floatingThreads, setFloatingThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [activeFloatingThreadId, setActiveFloatingThreadId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [floatingPrompt, setFloatingPrompt] = useState("");
  const [sendingMain, setSendingMain] = useState(false);
  const [sendingFloating, setSendingFloating] = useState(false);
  const [healthStatus, setHealthStatus] = useState("checking...");
  const [dashboardSummary, setDashboardSummary] = useState<Record<string, unknown> | null>(null);
  const [pumpRunning, setPumpRunning] = useState(false);
  const [pumpStatus, setPumpStatus] = useState("stopped");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [planName, setPlanName] = useState("");
  const [offerName, setOfferName] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [extensionName, setExtensionName] = useState("");
  const [extensionDescription, setExtensionDescription] = useState("");
  const [extensionPermissions, setExtensionPermissions] = useState("read-chat");
  const [accessRole, setAccessRole] = useState("admin");
  const [accessPermission, setAccessPermission] = useState("dashboard.view");
  const [accessAction, setAccessAction] = useState("allow");
  const [accessUserId, setAccessUserId] = useState("");
  const [modelName, setModelName] = useState("neuroedge-13b-instruct");
  const [modelTemperature, setModelTemperature] = useState("0.3");
  const [modelMaxTokens, setModelMaxTokens] = useState("2048");
  const [modelRouting, setModelRouting] = useState("balanced");
  const [flagKey, setFlagKey] = useState("mesh_inference");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [ticketStatus, setTicketStatus] = useState("open");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvent, setWebhookEvent] = useState("chat.completed");
  const [webhookId, setWebhookId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [promptTitle, setPromptTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptId, setPromptId] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkId, setLinkId] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentMembers, setDepartmentMembers] = useState("1");
  const [departmentTokens, setDepartmentTokens] = useState("10000");
  const [departmentId, setDepartmentId] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState("false");
  const [ssoProvider, setSsoProvider] = useState("okta");
  const [ssoDomain, setSsoDomain] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoMetadataUrl, setSsoMetadataUrl] = useState("");
  const [idverseEnabled, setIdverseEnabled] = useState("false");
  const [idverseBaseUrl, setIdverseBaseUrl] = useState("");
  const [idverseProjectId, setIdverseProjectId] = useState("");
  const [idverseTimeoutMs, setIdverseTimeoutMs] = useState("12000");
  const [extensionTargetId, setExtensionTargetId] = useState("");
  const [updateBanner, setUpdateBanner] = useState<null | {
    forceUpdate: boolean;
    latestVersion: string;
    playStoreUrl: string;
    releaseNotes: string;
  }>(null);
  const [listening, setListening] = useState(false);

  const voiceModuleRef = useRef<any>(null);
  const forceUpdateRequired = Boolean(updateBanner?.forceUpdate);
  const asObj = (v: any): Record<string, any> => (v && typeof v === "object" ? v : {});
  const toBool = (v: string): boolean => ["1", "true", "yes", "on", "enabled"].includes(String(v || "").trim().toLowerCase());

  const activeMain = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || threads[0] || null,
    [threads, activeThreadId]
  );
  const activeFloating = useMemo(
    () => floatingThreads.find((t) => t.id === activeFloatingThreadId) || floatingThreads[0] || null,
    [floatingThreads, activeFloatingThreadId]
  );
  const sidebarPages = remoteConfig?.shell?.sidebarPages || ["main_chat", "settings"];
  const dashboardSections = remoteConfig?.shell?.dashboardSections || ["bootstrap"];
  const isFounderAdmin = config.userRole === "founder" || config.userRole === "admin";
  const summary = asObj(dashboardSummary);
  const bootstrap = asObj(summary.bootstrap?.dashboard || summary.bootstrap || {});
  const extensionRows = Array.isArray(summary.extensions?.extensions)
    ? summary.extensions.extensions
    : Array.isArray(bootstrap.extensions)
    ? bootstrap.extensions
    : [];
  const ticketRows = Array.isArray(bootstrap.supportTickets) ? bootstrap.supportTickets : [];
  const promptRows = Array.isArray(bootstrap.savedPrompts) ? bootstrap.savedPrompts : [];
  const webhooksRows = Array.isArray(bootstrap.webhooks) ? bootstrap.webhooks : [];
  const agentsRows = Array.isArray(bootstrap.agentsLocal) ? bootstrap.agentsLocal : [];
  const linkRows = Array.isArray(bootstrap.domainLinks) ? bootstrap.domainLinks : [];
  const integrationsRows = Array.isArray(bootstrap.integrations) ? bootstrap.integrations : [];
  const historyRows = useMemo(
    () =>
      threads
        .flatMap((t) =>
          t.messages.map((m) => ({
            id: m.id,
            threadTitle: t.title,
            role: m.role,
            text: m.text,
            createdAt: m.createdAt,
          }))
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [threads]
  );
  const topbarPlanLabel = useMemo(() => {
    const raw = String(remoteConfig?.access?.plan || config.userPlan || "free").toLowerCase();
    if (!raw) return "Free";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [remoteConfig?.access?.plan, config.userPlan]);
  const topbarAccessLabel = useMemo(() => {
    if (remoteConfig?.access?.internalTools) return "Internal";
    if (remoteConfig?.access?.isGuest || config.userRole === "guest") return "Guest";
    if (topbarPlanLabel === "Enterprise") return "Enterprise";
    return "User";
  }, [remoteConfig?.access?.internalTools, remoteConfig?.access?.isGuest, config.userRole, topbarPlanLabel]);
  const accessTheme = useMemo(() => {
    if (topbarAccessLabel === "Guest") return { borderColor: "#6b7280", backgroundColor: "rgba(107,114,128,0.16)", textColor: "#e5e7eb" };
    if (topbarAccessLabel === "Enterprise") return { borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.16)", textColor: "#ede9fe" };
    if (topbarAccessLabel === "Internal") return { borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.16)", textColor: "#fef3c7" };
    return { borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.16)", textColor: "#dbeafe" };
  }, [topbarAccessLabel]);

  const pump = useMemo(() => new NeuroEdgeTwinActionPump(buildPumpConfig(config), 4000), [config]);

  useEffect(() => {
    (async () => {
      const [cfg, savedThreads, savedActive] = await Promise.all([loadConfig(), loadThreads(), loadActiveThreadId()]);
      setConfig(cfg);
      const mainThreads = savedThreads.length > 0 ? savedThreads : [newThread("New Chat")];
      setThreads(mainThreads);
      setActiveThreadId(savedActive && mainThreads.some((t) => t.id === savedActive) ? savedActive : mainThreads[0].id);
      const floatSeed = [newThread("Floating Chat")];
      setFloatingThreads(floatSeed);
      setActiveFloatingThreadId(floatSeed[0].id);

      const [h, rc, version] = await Promise.all([health(cfg), fetchRemoteConfig(cfg), checkMobileVersion(cfg)]);
      setHealthStatus(h.ok ? `online (${h.detail})` : `offline (${h.detail})`);
      setRemoteConfig(rc);
      if (version && version.latestVersion !== APP_VERSION) {
        setUpdateBanner({
          forceUpdate: version.forceUpdate,
          latestVersion: version.latestVersion,
          playStoreUrl: version.playStoreUrl,
          releaseNotes: version.releaseNotes,
        });
      }
      setBooting(false);
    })();
    return () => {
      pump.stop();
      try {
        const voice = voiceModuleRef.current;
        if (voice?.removeAllListeners) voice.removeAllListeners();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!booting) void saveThreads(threads);
  }, [threads, booting]);

  useEffect(() => {
    if (!booting && activeThreadId) void saveActiveThreadId(activeThreadId);
  }, [activeThreadId, booting]);

  useEffect(() => {
    const allowed = new Set(sidebarPages as string[]);
    if (!allowed.has(page)) {
      setPage("main_chat");
    }
  }, [page, sidebarPages]);

  useEffect(() => {
    if (forceUpdateRequired) return;
    if (!dashboardSummary && (page === "dashboard" || page === "extensions" || page === "projects")) {
      void refreshDashboard();
    }
  }, [page, dashboardSummary, forceUpdateRequired]);

  const upsertConfig = (next: AppConfig) => {
    setConfig(next);
    void saveConfig(next);
  };

  const createMainChat = () => {
    const t = newThread();
    setThreads((prev) => [t, ...prev]);
    setActiveThreadId(t.id);
    setPage("main_chat");
  };

  const ensureMain = (): ChatThread => {
    if (activeMain) return activeMain;
    const t = newThread();
    setThreads([t]);
    setActiveThreadId(t.id);
    return t;
  };

  const ensureFloating = (): ChatThread => {
    if (activeFloating) return activeFloating;
    const t = newThread("Floating Chat");
    setFloatingThreads([t]);
    setActiveFloatingThreadId(t.id);
    return t;
  };

  const mutateThreadMessages = (
    target: "main" | "floating",
    threadId: string,
    msgId: string,
    mode: "delete_after" | "edit_user"
  ) => {
    const setter = target === "main" ? setThreads : setFloatingThreads;
    setter((prev) =>
      prev.map((t) => {
        if (t.id !== threadId) return t;
        const idx = t.messages.findIndex((m) => m.id === msgId);
        if (idx < 0) return t;
        let nextMessages = t.messages.slice(0, idx);
        if (mode === "edit_user") nextMessages = [...t.messages.slice(0, idx + 1)];
        const firstUser = nextMessages.find((m) => m.role === "user");
        return { ...t, title: firstUser ? clipTitle(firstUser.text) : "New Chat", updatedAt: Date.now(), messages: nextMessages };
      })
    );
  };

  const onMessageLongPress = (target: "main" | "floating", item: ChatMessage) => {
    const thread = target === "main" ? activeMain : activeFloating;
    if (!thread) return;
    if (item.role === "assistant") {
      Alert.alert("Assistant response", "Action", [
        { text: "Share", onPress: () => void Share.share({ message: item.text }) },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    Alert.alert("User message", "Edit/Delete branch", [
      {
        text: "Edit",
        onPress: () => {
          mutateThreadMessages(target, thread.id, item.id, "edit_user");
          if (target === "main") setPrompt(item.text);
          else setFloatingPrompt(item.text);
        },
      },
      { text: "Delete", style: "destructive", onPress: () => mutateThreadMessages(target, thread.id, item.id, "delete_after") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const sendTo = async (target: "main" | "floating") => {
    const isMain = target === "main";
    const input = isMain ? prompt.trim() : floatingPrompt.trim();
    if (!input || (isMain ? sendingMain : sendingFloating)) return;

    const thread = isMain ? ensureMain() : ensureFloating();
    const userMsg: ChatMessage = { id: id("user"), role: "user", text: input, createdAt: Date.now() };
    if (isMain) {
      setSendingMain(true);
      setPrompt("");
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, title: t.messages.length ? t.title : clipTitle(input), updatedAt: Date.now(), messages: [...t.messages, userMsg] } : t)));
    } else {
      setSendingFloating(true);
      setFloatingPrompt("");
      setFloatingThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, title: t.messages.length ? t.title : clipTitle(input), updatedAt: Date.now(), messages: [...t.messages, userMsg] } : t)));
    }

    try {
      const resp = await askAssistant(input, [...thread.messages, userMsg], config);
      const assistantMsg: ChatMessage = { id: id("assistant"), role: "assistant", text: resp.response?.trim() || "No response returned.", trust: resp.trust, citations: resp.citations, createdAt: Date.now() };
      if (isMain) setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg] } : t)));
      else setFloatingThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg] } : t)));
    } catch (err: any) {
      const failMsg: ChatMessage = { id: id("assistant"), role: "assistant", text: `Request failed: ${err?.message || "unknown error"}`, createdAt: Date.now() };
      if (isMain) setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, messages: [...t.messages, failMsg] } : t)));
      else setFloatingThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, messages: [...t.messages, failMsg] } : t)));
    } finally {
      if (isMain) setSendingMain(false);
      else setSendingFloating(false);
    }
  };

  const pickFiles = async (target: "main" | "floating") => {
    try {
      const docModule: any = await import("react-native-document-picker");
      const doc: any = docModule?.default || docModule;
      const docTypes = doc?.types || docModule?.types || {};
      const result = await doc.pick({
        allowMultiSelection: true,
        type: [docTypes.allFiles].filter(Boolean),
      });
      const files = Array.isArray(result) ? result : [result];
      const names = files.map((f: any) => f?.name || "file").join(", ");
      if (target === "main") setPrompt((p) => `${p}${p ? "\n" : ""}[Attached: ${names}]`);
      else setFloatingPrompt((p) => `${p}${p ? "\n" : ""}[Attached: ${names}]`);
    } catch (err: any) {
      if (!String(err?.message || "").toLowerCase().includes("cancel")) {
        Alert.alert("File picker error", err?.message || "Could not pick file");
      }
    }
  };

  const toggleVoice = async (target: "main" | "floating") => {
    try {
      if (!voiceModuleRef.current) {
        const Voice = (await import("@react-native-voice/voice")).default;
        voiceModuleRef.current = Voice;
        Voice.onSpeechResults = (e: any) => {
          const text = Array.isArray(e?.value) ? e.value[0] || "" : "";
          if (target === "main") setPrompt((p) => `${p}${p ? " " : ""}${text}`.trim());
          else setFloatingPrompt((p) => `${p}${p ? " " : ""}${text}`.trim());
        };
        Voice.onSpeechEnd = () => setListening(false);
        Voice.onSpeechError = () => setListening(false);
      }

      const Voice = voiceModuleRef.current;
      if (listening) {
        await Voice.stop();
        setListening(false);
        return;
      }

      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Permission denied", "Microphone permission is required.");
          return;
        }
      }
      await Voice.start("en-US");
      setListening(true);
    } catch (err: any) {
      setListening(false);
      Alert.alert("Voice error", err?.message || "Could not start voice recognition");
    }
  };

  const togglePump = async () => {
    try {
      if (pumpRunning) {
        pump.stop();
        setPumpRunning(false);
        setPumpStatus("stopped");
      } else {
        setPumpStatus("starting...");
        await pump.start();
        setPumpRunning(true);
        setPumpStatus("running");
      }
    } catch (err: any) {
      setPumpStatus(`failed: ${err?.message || "error"}`);
    }
  };

  const refreshDashboard = async () => {
    setDashboardLoading(true);
    try {
      const parity = isFounderAdmin ? await fetchFounderAdminParity(config) : {};
      const base = await fetchRemoteConfig(config);
      setRemoteConfig(base);
      setDashboardSummary(parity);
    } catch (err: any) {
      setDashboardSummary({ error: err?.message || "dashboard refresh failed" });
    } finally {
      setDashboardLoading(false);
    }
  };

  const doFounderAction = async (path: string, body: Record<string, unknown>) => {
    try {
      const base = config.orchestratorUrl.replace(/\/$/, "");
      const result = await postJson<Record<string, unknown>>(`${base}${path}`, body, config);
      Alert.alert("Action complete", JSON.stringify(result).slice(0, 700));
      await refreshDashboard();
    } catch (err: any) {
      Alert.alert("Action failed", err?.message || "request failed");
    }
  };

  const doQuickCreatePlan = async () => {
    if (!planName.trim()) {
      Alert.alert("Missing plan name", "Enter a plan name.");
      return;
    }
    await doFounderAction("/admin/dashboard/plans/upsert", {
      plan: {
        name: planName.trim(),
        monthly: 0,
        yearly: 0,
        active: true,
        features: [],
      },
    });
    setPlanName("");
  };

  const doQuickCreateOffer = async () => {
    if (!offerName.trim()) {
      Alert.alert("Missing offer name", "Enter an offer name.");
      return;
    }
    await doFounderAction("/admin/dashboard/offers/upsert", {
      offer: {
        name: offerName.trim(),
        discountPercent: 10,
        audience: "new users",
        active: true,
      },
    });
    setOfferName("");
  };

  const doQuickCreateApiKey = async () => {
    if (!apiKeyName.trim()) {
      Alert.alert("Missing key name", "Enter key name.");
      return;
    }
    await doFounderAction("/admin/dashboard/api-keys/create", { name: apiKeyName.trim() });
    setApiKeyName("");
  };

  const doQuickCreateExtension = async () => {
    if (!extensionName.trim()) {
      Alert.alert("Missing extension name", "Enter extension name.");
      return;
    }
    const perms = extensionPermissions
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    await doFounderAction("/admin/dashboard/extensions/upsert", {
      extension: {
        name: extensionName.trim(),
        description: extensionDescription.trim(),
        version: "1.0.0",
        permissions: perms,
        active: true,
      },
    });
    setExtensionName("");
    setExtensionDescription("");
  };

  const doAccessRoleAction = async () => {
    await doFounderAction("/admin/dashboard/access/role-action", {
      role: accessRole.trim().toLowerCase(),
      permissionId: accessPermission.trim(),
      action: accessAction.trim().toLowerCase(),
    });
  };

  const doAccessUserAction = async () => {
    if (!accessUserId.trim()) {
      Alert.alert("Missing user id", "Enter user id/email.");
      return;
    }
    await doFounderAction("/admin/dashboard/access/user-action", {
      userId: accessUserId.trim(),
      permissionId: accessPermission.trim(),
      action: accessAction.trim().toLowerCase(),
    });
  };

  const doModelSave = async () => {
    await doFounderAction("/admin/dashboard/model/save", {
      modelControl: {
        model: modelName.trim(),
        temperature: Number(modelTemperature || 0.3),
        maxTokens: Number(modelMaxTokens || 2048),
        routing: modelRouting.trim() || "balanced",
      },
    });
  };

  const doToggleFlag = async () => {
    if (!flagKey.trim()) return;
    await doFounderAction("/admin/dashboard/flags/toggle", { key: flagKey.trim() });
  };

  const doTicketUpsert = async () => {
    if (!ticketSubject.trim() && !ticketId.trim()) {
      Alert.alert("Missing ticket", "Enter subject or id.");
      return;
    }
    await doFounderAction("/admin/dashboard/tickets/upsert", {
      ticket: {
        id: ticketId.trim() || undefined,
        subject: ticketSubject.trim(),
        status: ticketStatus,
      },
    });
    setTicketSubject("");
  };

  const doTicketDelete = async () => {
    if (!ticketId.trim()) return;
    await doFounderAction("/admin/dashboard/tickets/delete", { id: ticketId.trim() });
  };

  const doWebhookUpsert = async () => {
    if (!webhookUrl.trim()) return;
    await doFounderAction("/admin/dashboard/webhooks/upsert", {
      webhook: {
        id: webhookId.trim() || undefined,
        url: webhookUrl.trim(),
        event: webhookEvent.trim(),
        active: true,
      },
    });
    setWebhookUrl("");
  };

  const doWebhookDelete = async () => {
    if (!webhookId.trim()) return;
    await doFounderAction("/admin/dashboard/webhooks/delete", { id: webhookId.trim() });
  };

  const doWebhookTest = async () => {
    if (!webhookId.trim()) return;
    await doFounderAction("/admin/dashboard/webhooks/test", { id: webhookId.trim() });
  };

  const doAgentUpsert = async () => {
    if (!agentName.trim() && !agentId.trim()) return;
    await doFounderAction("/admin/dashboard/agents/upsert", {
      agent: {
        id: agentId.trim() || undefined,
        name: agentName.trim(),
      },
    });
    setAgentName("");
  };

  const doAgentDelete = async () => {
    if (!agentId.trim()) return;
    await doFounderAction("/admin/dashboard/agents/delete", { id: agentId.trim() });
  };

  const doPromptUpsert = async () => {
    if (!promptTitle.trim() || !promptText.trim()) return;
    await doFounderAction("/admin/dashboard/prompts/upsert", {
      prompt: { id: promptId.trim() || undefined, title: promptTitle.trim(), text: promptText.trim() },
    });
    setPromptTitle("");
    setPromptText("");
  };

  const doPromptDelete = async () => {
    if (!promptId.trim()) return;
    await doFounderAction("/admin/dashboard/prompts/delete", { id: promptId.trim() });
  };

  const doLinkUpsert = async () => {
    if (!linkName.trim() || !linkUrl.trim()) return;
    await doFounderAction("/admin/dashboard/links/upsert", {
      link: {
        id: linkId.trim() || undefined,
        name: linkName.trim(),
        url: linkUrl.trim(),
        type: "public",
        environment: "production",
        audience: "users",
        status: "active",
      },
    });
    setLinkName("");
    setLinkUrl("");
  };

  const doLinkDelete = async () => {
    if (!linkId.trim()) return;
    await doFounderAction("/admin/dashboard/links/delete", { id: linkId.trim() });
  };

  const doLinkToggle = async () => {
    if (!linkId.trim()) return;
    await doFounderAction("/admin/dashboard/links/toggle", { id: linkId.trim() });
  };

  const doLinkVerify = async () => {
    if (!linkId.trim()) return;
    await doFounderAction("/admin/dashboard/links/verify", { id: linkId.trim() });
  };

  const doDeptUpsert = async () => {
    if (!departmentName.trim() && !departmentId.trim()) return;
    await doFounderAction("/admin/dashboard/enterprise/departments/upsert", {
      department: {
        id: departmentId.trim() || undefined,
        name: departmentName.trim(),
        members: Number(departmentMembers || 1),
        tokensPerMonth: Number(departmentTokens || 10000),
      },
    });
    setDepartmentName("");
  };

  const doDeptDelete = async () => {
    if (!departmentId.trim()) return;
    await doFounderAction("/admin/dashboard/enterprise/departments/delete", { id: departmentId.trim() });
  };

  const doSsoSave = async () => {
    await doFounderAction("/admin/dashboard/enterprise/sso/save", {
      ssoConfig: {
        enabled: toBool(ssoEnabled),
        provider: ssoProvider.trim(),
        domain: ssoDomain.trim(),
        clientId: ssoClientId.trim(),
        metadataUrl: ssoMetadataUrl.trim(),
      },
    });
  };

  const doIdverseSave = async () => {
    await doFounderAction("/admin/dashboard/idverse/save", {
      idverse: {
        enabled: toBool(idverseEnabled),
        baseUrl: idverseBaseUrl.trim(),
        projectId: idverseProjectId.trim(),
        timeoutMs: Number(idverseTimeoutMs || 12000),
      },
    });
  };

  const doExtensionToggle = async () => {
    if (!extensionTargetId.trim()) return;
    await doFounderAction("/admin/dashboard/extensions/toggle", { id: extensionTargetId.trim() });
  };

  const doExtensionDelete = async () => {
    if (!extensionTargetId.trim()) return;
    await doFounderAction("/admin/dashboard/extensions/delete", { id: extensionTargetId.trim() });
  };

  const renderBubble = (item: ChatMessage, target: "main" | "floating") => (
    <Pressable onLongPress={() => onMessageLongPress(target, item)} style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
      <Text style={styles.bubbleText}>{item.text}</Text>
      {item.role === "assistant" && item.trust && (
        <View style={styles.trustBox}>
          <Text style={styles.trustTitle}>Why this answer</Text>
          {!!item.trust.why && <Text style={styles.trustLine}>{item.trust.why}</Text>}
          {item.trust.freshnessHours !== undefined && <Text style={styles.trustLine}>Freshness: {item.trust.freshnessHours}h</Text>}
          {item.trust.sourceQualityScore !== undefined && <Text style={styles.trustLine}>Source Quality: {Math.round((item.trust.sourceQualityScore || 0) * 100)}%</Text>}
          {item.trust.contradictionRisk !== undefined && <Text style={styles.trustLine}>Contradiction Risk: {Math.round((item.trust.contradictionRisk || 0) * 100)}%</Text>}
          {!!item.citations?.length && <Text style={styles.trustLine}>Citations: {item.citations.length}</Text>}
        </View>
      )}
    </Pressable>
  );

  if (booting) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#2563eb" />
        <Text style={styles.bootText}>Booting NeuroEdge Native...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topbar}>
        <Pressable style={styles.topBtn} onPress={() => setSidebarOpen((v) => !v)}>
          <Text style={styles.topBtnText}>☰</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>NeuroEdge</Text>
          <Text style={styles.subtitle}>Native • {healthStatus}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>Plan: {topbarPlanLabel}</Text>
            </View>
            <View style={[styles.accessChip, { borderColor: accessTheme.borderColor, backgroundColor: accessTheme.backgroundColor }]}>
              <Text style={[styles.accessChipText, { color: accessTheme.textColor }]}>Access: {topbarAccessLabel}</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.topBtn} onPress={createMainChat}>
          <Text style={styles.topBtnText}>＋</Text>
        </Pressable>
      </View>

      {updateBanner && (
        <View style={[styles.updateBanner, updateBanner.forceUpdate && styles.updateCritical]}>
          <Text style={styles.updateTitle}>Update available: v{updateBanner.latestVersion} {updateBanner.forceUpdate ? "(required)" : ""}</Text>
          <Text style={styles.updateText}>{updateBanner.releaseNotes}</Text>
          <Pressable style={styles.updateBtn} onPress={() => Linking.openURL(updateBanner.playStoreUrl)}>
            <Text style={styles.updateBtnText}>Open Play Store</Text>
          </Pressable>
        </View>
      )}

      {forceUpdateRequired && (
        <View style={styles.forceUpdateGate}>
          <Text style={styles.forceUpdateTitle}>Update Required</Text>
          <Text style={styles.forceUpdateText}>This version is blocked. Update to continue using NeuroEdge.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => updateBanner?.playStoreUrl && void Linking.openURL(updateBanner.playStoreUrl)}>
            <Text style={styles.primaryBtnText}>Update on Play Store</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.body}>
        {sidebarOpen && (
          <View style={styles.sidebar}>
            {sidebarPages.map((target) => (
              <Pressable
                key={target}
                style={[styles.sideItem, page === (target as Page) && styles.sideItemActive]}
                onPress={() => {
                  if (forceUpdateRequired && target !== "settings") {
                    Alert.alert("Update required", "Please update NeuroEdge from Play Store first.");
                    return;
                  }
                  setPage(target as Page);
                  setSidebarOpen(false);
                }}
              >
                <Text style={[styles.sideText, page === (target as Page) && styles.sideTextActive]}>{target.replace(/_/g, " ").toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.content}>
          {!forceUpdateRequired && page === "main_chat" && (
            <View style={styles.chatPage}>
              <FlatList data={activeMain?.messages || []} keyExtractor={(item) => item.id} renderItem={({ item }) => renderBubble(item, "main")} contentContainerStyle={styles.chatList} ListEmptyComponent={<Text style={styles.empty}>Start a main chat.</Text>} />
              <View style={styles.inputWrap}>
                <Pressable style={styles.actionBtn} onPress={() => void pickFiles("main")}><Text style={styles.actionText}>+</Text></Pressable>
                <TextInput value={prompt} onChangeText={setPrompt} style={styles.input} placeholder="Message NeuroEdge..." placeholderTextColor="#94a3b8" multiline />
                <Pressable style={styles.actionBtn} onPress={() => void toggleVoice("main")}><Text style={styles.actionText}>{listening ? "..." : "Mic"}</Text></Pressable>
                <Pressable style={[styles.sendBtn, sendingMain && styles.sendBusy]} onPress={() => void sendTo("main")}><Text style={styles.sendText}>{sendingMain ? "..." : "↑"}</Text></Pressable>
              </View>
            </View>
          )}

          {!forceUpdateRequired && page === "floating_chat" && (
            <View style={styles.chatPage}>
              <Text style={styles.sectionTitle}>Floating Chat</Text>
              <FlatList data={activeFloating?.messages || []} keyExtractor={(item) => item.id} renderItem={({ item }) => renderBubble(item, "floating")} contentContainerStyle={styles.chatList} ListEmptyComponent={<Text style={styles.empty}>Start a floating chat.</Text>} />
              <View style={styles.inputWrap}>
                <Pressable style={styles.actionBtn} onPress={() => void pickFiles("floating")}><Text style={styles.actionText}>+</Text></Pressable>
                <TextInput value={floatingPrompt} onChangeText={setFloatingPrompt} style={styles.input} placeholder="Floating assistant..." placeholderTextColor="#94a3b8" multiline />
                <Pressable style={styles.actionBtn} onPress={() => void toggleVoice("floating")}><Text style={styles.actionText}>{listening ? "..." : "Mic"}</Text></Pressable>
                <Pressable style={[styles.sendBtn, sendingFloating && styles.sendBusy]} onPress={() => void sendTo("floating")}><Text style={styles.sendText}>{sendingFloating ? "..." : "↑"}</Text></Pressable>
              </View>
            </View>
          )}

          {!forceUpdateRequired && page === "my_chats" && (
            <View style={styles.listPage}>
              <Pressable style={styles.primaryBtn} onPress={createMainChat}><Text style={styles.primaryBtnText}>+ New Main Chat</Text></Pressable>
              <FlatList
                data={threads}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable style={[styles.threadCard, item.id === activeThreadId && styles.threadCardActive]} onPress={() => { setActiveThreadId(item.id); setPage("main_chat"); }}>
                    <Text style={styles.threadTitle}>{item.title}</Text>
                    <Text style={styles.threadMeta}>{item.messages.length} messages • {new Date(item.updatedAt).toLocaleString()}</Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          {!forceUpdateRequired && page === "projects" && (
            <ScrollView contentContainerStyle={styles.listPage}>
              <Text style={styles.sectionTitle}>Projects & Integrations</Text>
              <Text style={styles.infoLine}>Linked domains: {linkRows.length} • Integrations: {integrationsRows.length}</Text>
              {linkRows.length === 0 && integrationsRows.length === 0 && (
                <Text style={styles.empty}>No projects yet. Add links/integrations from dashboard.</Text>
              )}
              {linkRows.map((row: any) => (
                <View key={`link-${row.id || row.url}`} style={styles.threadCard}>
                  <Text style={styles.threadTitle}>{row.name || row.url || "Project Link"}</Text>
                  <Text style={styles.threadMeta}>{row.environment || "production"} • {row.status || "active"}</Text>
                  {!!row.url && (
                    <Pressable style={[styles.smallBtn, { marginTop: 8, alignSelf: "flex-start" }]} onPress={() => void Linking.openURL(String(row.url))}>
                      <Text style={styles.smallBtnText}>Open</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {integrationsRows.map((row: any) => (
                <View key={`int-${row.id || row.appName}`} style={styles.threadCard}>
                  <Text style={styles.threadTitle}>{row.appName || "Integration App"}</Text>
                  <Text style={styles.threadMeta}>{row.environment || "production"} • {row.status || "active"}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {!forceUpdateRequired && page === "history" && (
            <ScrollView contentContainerStyle={styles.listPage}>
              <Text style={styles.sectionTitle}>History & Governance</Text>
              <Text style={styles.infoLine}>Entries: {historyRows.length}</Text>
              <Pressable
                style={[styles.secondaryBtn, { marginBottom: 12 }]}
                onPress={() =>
                  void Share.share({
                    message: historyRows
                      .slice(0, 200)
                      .map((h) => `[${new Date(h.createdAt).toISOString()}] ${h.threadTitle} • ${h.role}: ${h.text}`)
                      .join("\n"),
                  })
                }
              >
                <Text style={styles.secondaryBtnText}>Export Recent History</Text>
              </Pressable>
              {historyRows.length === 0 && <Text style={styles.empty}>No history yet.</Text>}
              {historyRows.map((row) => (
                <View key={`hist-${row.id}`} style={styles.threadCard}>
                  <Text style={styles.threadTitle}>{row.threadTitle}</Text>
                  <Text style={styles.threadMeta}>
                    {row.role.toUpperCase()} • {new Date(row.createdAt).toLocaleString()}
                  </Text>
                  <Text style={[styles.infoLine, { marginBottom: 0 }]}>{row.text}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {!forceUpdateRequired && page === "extensions" && (
            <ScrollView contentContainerStyle={styles.dashboardPage}>
              <Text style={styles.sectionTitle}>Extensions Runtime</Text>
              <Text style={styles.infoLine}>Manage extension lifecycle from orchestrator state.</Text>
              <TextInput style={styles.field} value={extensionTargetId} onChangeText={setExtensionTargetId} placeholder="Extension id to toggle/delete" placeholderTextColor="#94a3b8" />
              <View style={styles.rowWrap}>
                <Pressable style={styles.smallBtn} onPress={() => void doExtensionToggle()}><Text style={styles.smallBtnText}>Toggle Extension</Text></Pressable>
                <Pressable style={styles.smallBtn} onPress={() => void doExtensionDelete()}><Text style={styles.smallBtnText}>Delete Extension</Text></Pressable>
                <Pressable style={styles.smallBtn} onPress={() => void refreshDashboard()}><Text style={styles.smallBtnText}>Refresh</Text></Pressable>
              </View>
              <Text style={styles.infoLine}>Loaded extensions: {extensionRows.length}</Text>
              <Text style={styles.rawBlock}>{JSON.stringify(extensionRows, null, 2)}</Text>
            </ScrollView>
          )}

          {!forceUpdateRequired && page === "dashboard" && (
            <ScrollView contentContainerStyle={styles.dashboardPage}>
              <Text style={styles.sectionTitle}>Founder/Admin Native Dashboard Parity</Text>
              <Text style={styles.infoLine}>Role: {config.userRole} • Workspace: {config.orgId}/{config.workspaceId}</Text>
              <Text style={styles.infoLine}>Plan: {remoteConfig?.access?.plan || config.userPlan} • Internal tools: {remoteConfig?.access?.internalTools ? "yes" : "no"}</Text>
              <Text style={styles.infoLine}>Sections: {dashboardSections.join(", ")}</Text>
              <Pressable style={styles.primaryBtn} onPress={refreshDashboard}><Text style={styles.primaryBtnText}>{dashboardLoading ? "Refreshing..." : "Refresh Dashboard Parity"}</Text></Pressable>
              <Pressable style={styles.secondaryBtn} onPress={togglePump}><Text style={styles.secondaryBtnText}>{pumpRunning ? "Stop Twin Pump" : "Start Twin Pump"} ({pumpStatus})</Text></Pressable>
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Founder Actions</Text>
                  <View style={styles.rowWrap}>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/admin/restart", { service: "kernel", reason: "mobile_founder_action" })}><Text style={styles.smallBtnText}>Restart Kernel</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/admin/restart", { service: "ml", reason: "mobile_founder_action" })}><Text style={styles.smallBtnText}>Restart ML</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/admin/restart", { service: "orchestrator", reason: "mobile_founder_action" })}><Text style={styles.smallBtnText}>Restart Orchestrator</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/twin/scan", {})}><Text style={styles.smallBtnText}>Twin Scan</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/twin/analyze", {})}><Text style={styles.smallBtnText}>Twin Analyze</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doFounderAction("/admin/aegis/self-heal/run", { reason: "mobile_founder_action" })}><Text style={styles.smallBtnText}>Self Heal</Text></Pressable>
                  </View>
                </View>
              )}
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Plans / Offers / Keys / Extensions</Text>
                  <TextInput
                    style={styles.field}
                    value={planName}
                    onChangeText={setPlanName}
                    placeholder="Plan name"
                    placeholderTextColor="#94a3b8"
                  />
                  <Pressable style={styles.smallBtn} onPress={() => void doQuickCreatePlan()}>
                    <Text style={styles.smallBtnText}>Create Plan</Text>
                  </Pressable>

                  <TextInput
                    style={[styles.field, { marginTop: 8 }]}
                    value={offerName}
                    onChangeText={setOfferName}
                    placeholder="Offer name"
                    placeholderTextColor="#94a3b8"
                  />
                  <Pressable style={styles.smallBtn} onPress={() => void doQuickCreateOffer()}>
                    <Text style={styles.smallBtnText}>Create Offer</Text>
                  </Pressable>

                  <TextInput
                    style={[styles.field, { marginTop: 8 }]}
                    value={apiKeyName}
                    onChangeText={setApiKeyName}
                    placeholder="API key name"
                    placeholderTextColor="#94a3b8"
                  />
                  <Pressable style={styles.smallBtn} onPress={() => void doQuickCreateApiKey()}>
                    <Text style={styles.smallBtnText}>Generate API Key</Text>
                  </Pressable>

                  <TextInput
                    style={[styles.field, { marginTop: 8 }]}
                    value={extensionName}
                    onChangeText={setExtensionName}
                    placeholder="Extension name"
                    placeholderTextColor="#94a3b8"
                  />
                  <TextInput
                    style={styles.field}
                    value={extensionDescription}
                    onChangeText={setExtensionDescription}
                    placeholder="Extension description"
                    placeholderTextColor="#94a3b8"
                  />
                  <TextInput
                    style={styles.field}
                    value={extensionPermissions}
                    onChangeText={setExtensionPermissions}
                    placeholder="Permissions comma-separated"
                    placeholderTextColor="#94a3b8"
                  />
                  <Pressable style={styles.smallBtn} onPress={() => void doQuickCreateExtension()}>
                    <Text style={styles.smallBtnText}>Create Extension</Text>
                  </Pressable>
                </View>
              )}
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Access Control</Text>
                  <TextInput style={styles.field} value={accessRole} onChangeText={setAccessRole} placeholder="Role (founder/admin/developer/user...)" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={accessPermission} onChangeText={setAccessPermission} placeholder="Permission id" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={accessAction} onChangeText={setAccessAction} placeholder="Action: allow/suspend/revoke" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doAccessRoleAction()}><Text style={styles.smallBtnText}>Apply Role Permission</Text></Pressable>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={accessUserId} onChangeText={setAccessUserId} placeholder="User id/email override" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doAccessUserAction()}><Text style={styles.smallBtnText}>Apply User Override</Text></Pressable>
                </View>
              )}
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Model + Feature Flags</Text>
                  <TextInput style={styles.field} value={modelName} onChangeText={setModelName} placeholder="Model" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={modelTemperature} onChangeText={setModelTemperature} placeholder="Temperature" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={modelMaxTokens} onChangeText={setModelMaxTokens} placeholder="Max tokens" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={modelRouting} onChangeText={setModelRouting} placeholder="Routing" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doModelSave()}><Text style={styles.smallBtnText}>Save Model Control</Text></Pressable>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={flagKey} onChangeText={setFlagKey} placeholder="Feature flag key" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doToggleFlag()}><Text style={styles.smallBtnText}>Toggle Feature Flag</Text></Pressable>
                </View>
              )}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Tickets + Prompts</Text>
                <TextInput style={styles.field} value={ticketSubject} onChangeText={setTicketSubject} placeholder="Ticket subject" placeholderTextColor="#94a3b8" />
                <TextInput style={styles.field} value={ticketId} onChangeText={setTicketId} placeholder="Ticket id (for update/delete)" placeholderTextColor="#94a3b8" />
                <TextInput style={styles.field} value={ticketStatus} onChangeText={setTicketStatus} placeholder="Ticket status" placeholderTextColor="#94a3b8" />
                <View style={styles.rowWrap}>
                  <Pressable style={styles.smallBtn} onPress={() => void doTicketUpsert()}><Text style={styles.smallBtnText}>Upsert Ticket</Text></Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => void doTicketDelete()}><Text style={styles.smallBtnText}>Delete Ticket</Text></Pressable>
                </View>
                <TextInput style={[styles.field, { marginTop: 8 }]} value={promptTitle} onChangeText={setPromptTitle} placeholder="Prompt title" placeholderTextColor="#94a3b8" />
                <TextInput style={styles.field} value={promptText} onChangeText={setPromptText} placeholder="Prompt text" placeholderTextColor="#94a3b8" />
                <TextInput style={styles.field} value={promptId} onChangeText={setPromptId} placeholder="Prompt id (for update/delete)" placeholderTextColor="#94a3b8" />
                <View style={styles.rowWrap}>
                  <Pressable style={styles.smallBtn} onPress={() => void doPromptUpsert()}><Text style={styles.smallBtnText}>Upsert Prompt</Text></Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => void doPromptDelete()}><Text style={styles.smallBtnText}>Delete Prompt</Text></Pressable>
                </View>
              </View>
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Webhooks + Links</Text>
                  <TextInput style={styles.field} value={webhookUrl} onChangeText={setWebhookUrl} placeholder="Webhook URL" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={webhookEvent} onChangeText={setWebhookEvent} placeholder="Webhook event" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={webhookId} onChangeText={setWebhookId} placeholder="Webhook id (test/delete/update)" placeholderTextColor="#94a3b8" />
                  <View style={styles.rowWrap}>
                    <Pressable style={styles.smallBtn} onPress={() => void doWebhookUpsert()}><Text style={styles.smallBtnText}>Upsert Webhook</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doWebhookTest()}><Text style={styles.smallBtnText}>Test Webhook</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doWebhookDelete()}><Text style={styles.smallBtnText}>Delete Webhook</Text></Pressable>
                  </View>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={linkName} onChangeText={setLinkName} placeholder="Link name" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={linkUrl} onChangeText={setLinkUrl} placeholder="Link URL" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={linkId} onChangeText={setLinkId} placeholder="Link id (toggle/verify/delete)" placeholderTextColor="#94a3b8" />
                  <View style={styles.rowWrap}>
                    <Pressable style={styles.smallBtn} onPress={() => void doLinkUpsert()}><Text style={styles.smallBtnText}>Upsert Link</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doLinkVerify()}><Text style={styles.smallBtnText}>Verify Link</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doLinkToggle()}><Text style={styles.smallBtnText}>Toggle Link</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doLinkDelete()}><Text style={styles.smallBtnText}>Delete Link</Text></Pressable>
                  </View>
                </View>
              )}
              {isFounderAdmin && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Agents + Enterprise + IDVerse</Text>
                  <TextInput style={styles.field} value={agentName} onChangeText={setAgentName} placeholder="Agent name" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={agentId} onChangeText={setAgentId} placeholder="Agent id (update/delete)" placeholderTextColor="#94a3b8" />
                  <View style={styles.rowWrap}>
                    <Pressable style={styles.smallBtn} onPress={() => void doAgentUpsert()}><Text style={styles.smallBtnText}>Upsert Agent</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doAgentDelete()}><Text style={styles.smallBtnText}>Delete Agent</Text></Pressable>
                  </View>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={departmentName} onChangeText={setDepartmentName} placeholder="Department name" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={departmentMembers} onChangeText={setDepartmentMembers} placeholder="Members" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={departmentTokens} onChangeText={setDepartmentTokens} placeholder="Tokens/month" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={departmentId} onChangeText={setDepartmentId} placeholder="Department id (delete/update)" placeholderTextColor="#94a3b8" />
                  <View style={styles.rowWrap}>
                    <Pressable style={styles.smallBtn} onPress={() => void doDeptUpsert()}><Text style={styles.smallBtnText}>Upsert Department</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void doDeptDelete()}><Text style={styles.smallBtnText}>Delete Department</Text></Pressable>
                  </View>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={ssoEnabled} onChangeText={setSsoEnabled} placeholder="SSO enabled true/false" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={ssoProvider} onChangeText={setSsoProvider} placeholder="SSO provider" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={ssoDomain} onChangeText={setSsoDomain} placeholder="SSO domain" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={ssoClientId} onChangeText={setSsoClientId} placeholder="SSO client id" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={ssoMetadataUrl} onChangeText={setSsoMetadataUrl} placeholder="SSO metadata URL" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doSsoSave()}><Text style={styles.smallBtnText}>Save SSO</Text></Pressable>
                  <TextInput style={[styles.field, { marginTop: 8 }]} value={idverseEnabled} onChangeText={setIdverseEnabled} placeholder="IDVerse enabled true/false" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={idverseBaseUrl} onChangeText={setIdverseBaseUrl} placeholder="IDVerse base URL" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={idverseProjectId} onChangeText={setIdverseProjectId} placeholder="IDVerse project id" placeholderTextColor="#94a3b8" />
                  <TextInput style={styles.field} value={idverseTimeoutMs} onChangeText={setIdverseTimeoutMs} placeholder="IDVerse timeout ms" placeholderTextColor="#94a3b8" />
                  <Pressable style={styles.smallBtn} onPress={() => void doIdverseSave()}><Text style={styles.smallBtnText}>Save IDVerse</Text></Pressable>
                </View>
              )}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Current Dashboard Data</Text>
                <Text style={styles.infoLine}>Tickets: {ticketRows.length} • Prompts: {promptRows.length} • Webhooks: {webhooksRows.length} • Agents: {agentsRows.length} • Links: {linkRows.length} • Integrations: {integrationsRows.length}</Text>
              </View>
              <Text style={styles.sectionTitle}>Parity Data</Text>
              <Text style={styles.rawBlock}>{JSON.stringify(dashboardSummary || { status: "no_data" }, null, 2)}</Text>
            </ScrollView>
          )}

          {page === "settings" && (
            <ScrollView contentContainerStyle={styles.settingsPage}>
              <Text style={styles.sectionTitle}>Connection & Identity</Text>
              <TextInput style={styles.field} value={config.orchestratorUrl} onChangeText={(v) => upsertConfig({ ...config, orchestratorUrl: v })} placeholder="Orchestrator URL" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.field} value={config.apiKey} onChangeText={(v) => upsertConfig({ ...config, apiKey: v })} placeholder="API Key" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.field} value={config.bearerToken} onChangeText={(v) => upsertConfig({ ...config, bearerToken: v })} placeholder="Bearer Token" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.field} value={config.orgId} onChangeText={(v) => upsertConfig({ ...config, orgId: v })} placeholder="Org ID" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.field} value={config.workspaceId} onChangeText={(v) => upsertConfig({ ...config, workspaceId: v })} placeholder="Workspace ID" placeholderTextColor="#94a3b8" />
              <TextInput
                style={styles.field}
                value={config.userPlan}
                onChangeText={(v) =>
                  upsertConfig({ ...config, userPlan: ((v || "free").trim().toLowerCase() as AppConfig["userPlan"]) })
                }
                placeholder="User Plan (free/plus/pro/enterprise)"
                placeholderTextColor="#94a3b8"
              />
              <TextInput style={styles.field} value={config.userEmail} onChangeText={(v) => upsertConfig({ ...config, userEmail: v })} placeholder="User Email" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.field} value={config.userName} onChangeText={(v) => upsertConfig({ ...config, userName: v })} placeholder="User Name" placeholderTextColor="#94a3b8" />
              <View style={styles.roleRow}>
                {(["guest", "user", "founder", "admin", "developer", "enterprise"] as UserRole[]).map((role) => (
                  <Pressable key={role} style={[styles.roleChip, config.userRole === role && styles.roleChipActive]} onPress={() => upsertConfig({ ...config, userRole: role })}>
                    <Text style={[styles.roleText, config.userRole === role && styles.roleTextActive]}>{role}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.infoLine}>App version: {APP_VERSION}</Text>
              <Pressable style={styles.secondaryBtn} onPress={async () => {
                const v = await checkMobileVersion(config);
                if (!v) {
                  Alert.alert("Version check", "Could not fetch version endpoint.");
                  return;
                }
                Alert.alert(
                  "Version status",
                  `Current: ${APP_VERSION}\nLatest: ${v.latestVersion}\nChannel: ${v.releaseChannel || "public"}`
                );
              }}>
                <Text style={styles.secondaryBtnText}>Check for updates</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>

      {!forceUpdateRequired && (
        <Pressable style={styles.floatingLauncher} onPress={() => { setPage("floating_chat"); setSidebarOpen(false); }}>
          <Text style={styles.floatingLauncherText}>Chat</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#020617" },
  bootText: { color: "#cbd5e1", marginTop: 8 },
  topbar: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  topBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: "#334155", alignItems: "center", justifyContent: "center", marginRight: 10 },
  topBtnText: { color: "#e2e8f0", fontWeight: "800" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#7dd3fc", fontSize: 12, fontWeight: "600" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  planBadge: {
    borderWidth: 1,
    borderColor: "#0ea5e9",
    backgroundColor: "rgba(14,165,233,0.15)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planBadgeText: { color: "#e0f2fe", fontSize: 11, fontWeight: "700" },
  accessChip: {
    borderWidth: 1,
    borderColor: "#34d399",
    backgroundColor: "rgba(16,185,129,0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  accessChipText: { color: "#dcfce7", fontSize: 11, fontWeight: "700" },
  updateBanner: { margin: 10, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#0ea5e9", backgroundColor: "#082f49" },
  updateCritical: { borderColor: "#ef4444", backgroundColor: "#450a0a" },
  updateTitle: { color: "#e2e8f0", fontWeight: "800", fontSize: 12 },
  updateText: { color: "#cbd5e1", fontSize: 12, marginTop: 4 },
  updateBtn: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#2563eb", borderRadius: 8 },
  updateBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  forceUpdateGate: { marginHorizontal: 10, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: "#ef4444", backgroundColor: "#450a0a", padding: 10 },
  forceUpdateTitle: { color: "#fee2e2", fontWeight: "800", fontSize: 14 },
  forceUpdateText: { color: "#fecaca", marginTop: 6, marginBottom: 8, fontSize: 12 },
  body: { flex: 1, flexDirection: "row" },
  sidebar: { width: 160, borderRightWidth: 1, borderRightColor: "#1e293b", padding: 8, gap: 6 },
  sideItem: { paddingHorizontal: 8, paddingVertical: 10, borderRadius: 8 },
  sideItemActive: { backgroundColor: "#1d4ed8" },
  sideText: { color: "#94a3b8", fontWeight: "700", fontSize: 12 },
  sideTextActive: { color: "#eff6ff" },
  content: { flex: 1 },
  chatPage: { flex: 1, padding: 10 },
  chatList: { gap: 8, paddingBottom: 10 },
  bubble: { borderRadius: 12, padding: 10, borderWidth: 1, maxWidth: "92%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#0b1730", borderColor: "#2563eb" },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: "#0f172a", borderColor: "#334155" },
  bubbleText: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
  trustBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#334155", paddingTop: 6 },
  trustTitle: { color: "#7dd3fc", fontSize: 12, fontWeight: "700" },
  trustLine: { color: "#cbd5e1", fontSize: 12 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 20 },
  inputWrap: { marginTop: "auto", flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderColor: "#334155", backgroundColor: "#0f172a", borderRadius: 16, padding: 8, gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#334155", alignItems: "center", justifyContent: "center" },
  actionText: { color: "#e2e8f0", fontWeight: "700", fontSize: 12 },
  input: { flex: 1, color: "#e2e8f0", maxHeight: 120, fontSize: 14, paddingVertical: 4 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  sendBusy: { backgroundColor: "#ef4444" },
  sendText: { color: "white", fontWeight: "800", fontSize: 16 },
  listPage: { flex: 1, padding: 10 },
  dashboardPage: { padding: 10 },
  settingsPage: { padding: 10 },
  sectionTitle: { color: "#7dd3fc", fontSize: 15, fontWeight: "800", marginBottom: 8 },
  infoLine: { color: "#cbd5e1", fontSize: 13, marginBottom: 8 },
  rawBlock: { color: "#cbd5e1", backgroundColor: "#0b1220", borderWidth: 1, borderColor: "#1e293b", borderRadius: 10, padding: 10, fontSize: 11, marginBottom: 10 },
  field: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: "#e2e8f0", backgroundColor: "#0b1220", marginBottom: 8 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 12 },
  roleChip: { borderWidth: 1, borderColor: "#334155", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  roleChipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  roleText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  roleTextActive: { color: "#eff6ff" },
  primaryBtn: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 10 },
  primaryBtnText: { color: "white", fontWeight: "800" },
  secondaryBtn: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 10 },
  secondaryBtnText: { color: "#cbd5e1", fontWeight: "700" },
  threadCard: { borderWidth: 1, borderColor: "#1e293b", backgroundColor: "#0b1220", borderRadius: 10, padding: 10, marginBottom: 8 },
  threadCardActive: { borderColor: "#38bdf8" },
  threadTitle: { color: "#e2e8f0", fontWeight: "700" },
  threadMeta: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  card: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: "#0b1220" },
  cardTitle: { color: "#e2e8f0", fontWeight: "800", marginBottom: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallBtn: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#0f172a" },
  smallBtnText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  floatingLauncher: { position: "absolute", right: 12, top: "52%", marginTop: -20, backgroundColor: "#2563eb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#1d4ed8" },
  floatingLauncherText: { color: "white", fontWeight: "800", fontSize: 12 },
});
