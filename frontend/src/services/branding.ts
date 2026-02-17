export interface BrandingConfig {
  productName: string;
  logoUrl: string;
  iconUrl: string;
  faviconUrl: string;
}

const KEY = "neuroedge_branding_v1";

export const defaultBranding: BrandingConfig = {
  productName: "NeuroEdge",
  logoUrl: "/logo.png",
  iconUrl: "/icon.png",
  faviconUrl: "/favicon.ico",
};

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

