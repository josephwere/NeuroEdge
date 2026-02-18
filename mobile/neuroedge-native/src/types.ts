export type UserRole = "founder" | "admin" | "developer" | "user" | "enterprise" | "guest";

export interface TrustMetadata {
  why?: string;
  freshnessHours?: number | null;
  sourceQualityScore?: number;
  contradictionRisk?: number;
  citationCount?: number;
}

export interface Citation {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  trust?: TrustMetadata;
  citations?: Citation[];
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface AppConfig {
  orchestratorUrl: string;
  apiKey: string;
  bearerToken: string;
  orgId: string;
  workspaceId: string;
  userRole: UserRole;
  userPlan: "free" | "plus" | "pro" | "enterprise" | "business" | "team" | "premium";
  userEmail: string;
  userName: string;
  kernelId: string;
  style: "concise" | "balanced" | "detailed";
}

export interface AiResponse {
  success?: boolean;
  response?: string;
  reasoning?: string;
  trust?: TrustMetadata;
  citations?: Citation[];
}

export interface MobileVersionInfo {
  status: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  releaseChannel?: "public" | "internal";
  playStoreUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

export interface MobileRemoteConfig {
  status: string;
  appVersion: string;
  access?: {
    plan?: string;
    isPaidPlan?: boolean;
    internalTools?: boolean;
    isGuest?: boolean;
  };
  shell: {
    sidebarPages: string[];
    sidebarViews?: string[];
    dashboardSections: string[];
    featureFlags: Record<string, boolean>;
  };
  endpoints: {
    dashboardBootstrap: string;
    dashboardAccessBootstrap: string;
    deviceProtectionBootstrap: string;
    aegisStatus: string;
    metrics: string;
    version: string;
    meshNodes: string;
    twinReport: string;
    neurotwinProfile: string;
  };
}
