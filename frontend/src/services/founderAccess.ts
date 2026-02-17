function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function looksLikeFounder(name: string, email: string): boolean {
  const n = normalize(name);
  const e = normalize(email);
  const founderNames = [
    "joseph were",
    "josephwere",
    "joseph-were",
  ];
  const founderEmails = [
    "josephwere@",
    "joseph.were@",
    "jwere@",
  ];
  return (
    founderNames.some((k) => n.includes(k)) ||
    founderEmails.some((k) => e.includes(k))
  );
}

function readLocalProfile(): { name: string; email: string; role: string } {
  let name = "";
  let email = "";
  let role = "";
  try {
    const rawUser = localStorage.getItem("neuroedge_user");
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      name = String(parsed?.name || name);
      email = String(parsed?.email || email);
      role = String(parsed?.role || role);
    }
    const rawProfile = localStorage.getItem("neuroedge_profile_settings");
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile);
      name = String(parsed?.name || name);
      email = String(parsed?.email || email);
      role = String(parsed?.role || role);
    }
    const rawSession = localStorage.getItem("neuroedge_session");
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      name = String(parsed?.name || name);
      email = String(parsed?.email || email);
      role = String(parsed?.role || role);
    }
  } catch {
    // Ignore malformed local storage.
  }
  return { name, email, role };
}

export function isFounderUser(): boolean {
  const envEnabled = normalize(import.meta.env.VITE_FOUNDER_MODE as string) === "true";
  const envName = normalize(import.meta.env.VITE_FOUNDER_NAME as string);
  const envEmail = normalize(import.meta.env.VITE_FOUNDER_EMAIL as string);
  const profile = readLocalProfile();
  const roleFounder = normalize(profile.role) === "founder";
  const localFounder = looksLikeFounder(profile.name, profile.email);
  const envFounder = looksLikeFounder(envName, envEmail);
  return envEnabled || roleFounder || localFounder || envFounder;
}
