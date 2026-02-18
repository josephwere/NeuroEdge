import { type BrandingConfig, loadBranding } from "@/services/branding";

export interface UserCustomizationConfig {
  mainChatIconUrl: string;
  floatingChatIconUrl: string;
  mainChatBackgroundUrl: string;
  floatingChatBackgroundUrl: string;
  mainChatOverlayOpacity: number | null;
  floatingOverlayOpacity: number | null;
  accentColor: string;
}

export interface EffectiveChatBranding extends BrandingConfig {
  mainChatIconUrl: string;
  floatingChatIconUrl: string;
}

const KEY = "neuroedge_user_customization_v1";
const UPDATE_EVENT = "neuroedge:userCustomizationUpdated";

export const defaultUserCustomization: UserCustomizationConfig = {
  mainChatIconUrl: "",
  floatingChatIconUrl: "",
  mainChatBackgroundUrl: "",
  floatingChatBackgroundUrl: "",
  mainChatOverlayOpacity: null,
  floatingOverlayOpacity: null,
  accentColor: "",
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function loadUserCustomization(): UserCustomizationConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultUserCustomization;
    const parsed = JSON.parse(raw) as Partial<UserCustomizationConfig>;
    const mainOpacity =
      parsed.mainChatOverlayOpacity === null || parsed.mainChatOverlayOpacity === undefined
        ? null
        : clamp(Number(parsed.mainChatOverlayOpacity), 0.1, 1);
    const floatingOpacity =
      parsed.floatingOverlayOpacity === null || parsed.floatingOverlayOpacity === undefined
        ? null
        : clamp(Number(parsed.floatingOverlayOpacity), 0.2, 1);
    return {
      mainChatIconUrl: String(parsed.mainChatIconUrl || "").trim(),
      floatingChatIconUrl: String(parsed.floatingChatIconUrl || "").trim(),
      mainChatBackgroundUrl: String(parsed.mainChatBackgroundUrl || "").trim(),
      floatingChatBackgroundUrl: String(parsed.floatingChatBackgroundUrl || "").trim(),
      mainChatOverlayOpacity: Number.isFinite(mainOpacity as number) ? mainOpacity : null,
      floatingOverlayOpacity: Number.isFinite(floatingOpacity as number) ? floatingOpacity : null,
      accentColor: String(parsed.accentColor || "").trim(),
    };
  } catch {
    return defaultUserCustomization;
  }
}

export function saveUserCustomization(next: Partial<UserCustomizationConfig>) {
  const merged = { ...loadUserCustomization(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: merged }));
}

export function clearUserCustomization() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: defaultUserCustomization,
    })
  );
}

export function loadEffectiveChatBranding(): EffectiveChatBranding {
  const branding = loadBranding();
  const custom = loadUserCustomization();
  return {
    ...branding,
    accentColor: custom.accentColor || branding.accentColor,
    mainChatBackgroundUrl: custom.mainChatBackgroundUrl || branding.mainChatBackgroundUrl,
    floatingChatBackgroundUrl:
      custom.floatingChatBackgroundUrl || branding.floatingChatBackgroundUrl,
    mainChatOverlayOpacity:
      custom.mainChatOverlayOpacity === null
        ? branding.mainChatOverlayOpacity
        : custom.mainChatOverlayOpacity,
    floatingOverlayOpacity:
      custom.floatingOverlayOpacity === null
        ? branding.floatingOverlayOpacity
        : custom.floatingOverlayOpacity,
    mainChatIconUrl:
      custom.mainChatIconUrl || branding.iconUrl || branding.logoUrl || "/icon.png",
    floatingChatIconUrl:
      custom.floatingChatIconUrl || branding.iconUrl || branding.logoUrl || "/icon.png",
  };
}

export function userCustomizationUpdateEventName() {
  return UPDATE_EVENT;
}
