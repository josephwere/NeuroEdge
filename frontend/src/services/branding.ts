export interface BrandingConfig {
  productName: string;
  logoUrl: string;
  iconUrl: string;
  faviconUrl: string;
  mainChatBackgroundUrl: string;
  floatingChatBackgroundUrl: string;
  loginBackgroundUrl: string;
  mainChatOverlayOpacity: number;
  floatingOverlayOpacity: number;
  loginOverlayOpacity: number;
  accentColor: string;
  glassBlur: number;
}

const KEY = "neuroedge_branding_v1";

export const defaultBranding: BrandingConfig = {
  productName: "NeuroEdge",
  logoUrl: "/logo.png",
  iconUrl: "/icon.png",
  faviconUrl: "/favicon.ico",
  mainChatBackgroundUrl: "",
  floatingChatBackgroundUrl: "",
  loginBackgroundUrl: "",
  mainChatOverlayOpacity: 0.62,
  floatingOverlayOpacity: 0.92,
  loginOverlayOpacity: 0.6,
  accentColor: "#2563eb",
  glassBlur: 6,
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function loadBranding(): BrandingConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultBranding;
    const parsed = JSON.parse(raw) as Partial<BrandingConfig>;
    return {
      productName: parsed.productName?.trim() || defaultBranding.productName,
      logoUrl: parsed.logoUrl?.trim() || defaultBranding.logoUrl,
      iconUrl: parsed.iconUrl?.trim() || defaultBranding.iconUrl,
      faviconUrl: parsed.faviconUrl?.trim() || parsed.iconUrl?.trim() || defaultBranding.faviconUrl,
      mainChatBackgroundUrl: parsed.mainChatBackgroundUrl?.trim() || defaultBranding.mainChatBackgroundUrl,
      floatingChatBackgroundUrl: parsed.floatingChatBackgroundUrl?.trim() || defaultBranding.floatingChatBackgroundUrl,
      loginBackgroundUrl: parsed.loginBackgroundUrl?.trim() || defaultBranding.loginBackgroundUrl,
      mainChatOverlayOpacity: clamp(Number(parsed.mainChatOverlayOpacity ?? defaultBranding.mainChatOverlayOpacity), 0.1, 1),
      floatingOverlayOpacity: clamp(Number(parsed.floatingOverlayOpacity ?? defaultBranding.floatingOverlayOpacity), 0.2, 1),
      loginOverlayOpacity: clamp(Number(parsed.loginOverlayOpacity ?? defaultBranding.loginOverlayOpacity), 0.1, 1),
      accentColor: String(parsed.accentColor || defaultBranding.accentColor),
      glassBlur: clamp(Number(parsed.glassBlur ?? defaultBranding.glassBlur), 0, 24),
    };
  } catch {
    return defaultBranding;
  }
}

export function saveBranding(next: Partial<BrandingConfig>) {
  const merged = { ...loadBranding(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  applyBrandingToDocument(merged);
  window.dispatchEvent(new CustomEvent("neuroedge:brandingUpdated", { detail: merged }));
}

export function applyBrandingToDocument(config = loadBranding()) {
  document.title = config.productName || defaultBranding.productName;
  const href = config.faviconUrl || config.iconUrl || defaultBranding.faviconUrl;
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}
