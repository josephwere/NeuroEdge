export type TwinActionType =
  | "answer_phone_call"
  | "answer_whatsapp_call"
  | "answer_video_call"
  | "sync_availability";

export interface TwinAction {
  id: string;
  deviceId: string;
  actionType: TwinActionType | string;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export interface TwinBridgeConfig {
  baseUrl: string;
  headers: {
    apiKey?: string;
    bearerToken?: string;
    orgId?: string;
    workspaceId?: string;
    userRole?: string;
    userEmail?: string;
    userName?: string;
  };
  device: {
    id: string;
    platform: "android" | "ios";
    deviceName: string;
    appVersion: string;
    osVersion: string;
    pushToken?: string;
    attestationProvider?: string;
    attestationStatus?: "trusted" | "unknown" | "failed";
  };
}
