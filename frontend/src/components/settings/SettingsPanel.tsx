import React, { useEffect, useState } from "react";

/* =========================================================
   Types — shared contract with orchestrator (future-proof)
   ========================================================= */

type KernelHealthStatus = "ready" | "offline" | "degraded";

interface KernelInfo {
  id: string;
  status: KernelHealthStatus;
  version: string;
  capabilities: string[];
}

interface SettingsState {
  founderMode: boolean;
  voiceAlertsEnabled: boolean;
  preferredVoice: string;
  kernelAutoBalance: boolean;
  themeMode: "system" | "light" | "dark";
  notificationEmail: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  autoSaveDrafts: boolean;
  twoFactorEnabled: boolean;
  passkeysEnabled: boolean;
  reduceMotion: boolean;
  fontScale: number;
}

/* =========================================================
   SettingsPanel — NeuroEdge Founder Control Center
   ========================================================= */

const SettingsPanel: React.FC = () => {
  const runtimeMode = ((import.meta as any).env?.VITE_NEUROEDGE_MODE || "sovereign") as string;

  /* -------------------- State -------------------- */

  const [settings, setSettings] = useState<SettingsState>({
    founderMode: true,
    voiceAlertsEnabled: true,
    preferredVoice: "default",
    kernelAutoBalance: true,
    themeMode: "system",
    notificationEmail: "",
    emailNotifications: true,
    pushNotifications: true,
    autoSaveDrafts: true,
    twoFactorEnabled: false,
    passkeysEnabled: false,
    reduceMotion: false,
    fontScale: 1,
  });

  const [kernels, setKernels] = useState<KernelInfo[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  /* -------------------- Lifecycle -------------------- */

  useEffect(() => {
    console.log("[NeuroEdge] SettingsPanel mounted");

    detectTTS();
    loadKernelSnapshot();
    try {
      const raw = localStorage.getItem("neuroedge_settings_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore load failures
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("neuroedge_settings_v2", JSON.stringify(settings));
    if (settings.themeMode === "light" || settings.themeMode === "dark") {
      document.documentElement.setAttribute("data-theme", settings.themeMode);
    }
    document.documentElement.style.fontSize = `${Math.max(0.85, Math.min(1.2, settings.fontScale)) * 16}px`;
    document.documentElement.style.setProperty("--ne-reduced-motion", settings.reduceMotion ? "1" : "0");
  }, [settings]);

  /* -------------------- TTS Detection -------------------- */

  const detectTTS = () => {
    if ("speechSynthesis" in window) {
      setTtsAvailable(true);
      console.log("[NeuroEdge] Browser TTS available");
    } else {
      console.warn("[NeuroEdge] Browser TTS not supported");
    }
  };

  /* -------------------- Kernel Snapshot -------------------- */
  const loadKernelSnapshot = async () => {
    try {
      const baseUrl =
        (import.meta as any).env?.VITE_ORCHESTRATOR_URL || "http://localhost:7070";
      const resp = await fetch(`${baseUrl}/kernels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch kernels: ${resp.status}`);
      }

      const data = await resp.json();
      const normalized: KernelInfo[] = Object.entries(data || {}).map(
        ([id, info]: [string, any]) => ({
          id,
          status: info?.status || "offline",
          version: info?.version || "unknown",
          capabilities: Array.isArray(info?.capabilities) ? info.capabilities : [],
        })
      );
      setKernels(normalized);
      console.log("[NeuroEdge] Kernel snapshot loaded");
    } catch (err) {
      console.error("[NeuroEdge] Failed to load kernel snapshot", err);
    }
  };

  /* -------------------- TTS Test -------------------- */

  const speakTestMessage = () => {
    if (!ttsAvailable || !settings.voiceAlertsEnabled) return;

    const utterance = new SpeechSynthesisUtterance(
      "Joseph, NeuroEdge voice alerts are active."
    );
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  };

  const kernelStatusColor = (status: KernelHealthStatus) => {
    if (status === "ready") return "#16a34a";
    if (status === "degraded") return "#ca8a04";
    return "#dc2626";
  };

  const exportLocalSettings = () => {
    const payload = {
      settings,
      profile: JSON.parse(localStorage.getItem("neuroedge_profile_settings") || "{}"),
      aiPreferences: JSON.parse(localStorage.getItem("neuroedge_ai_preferences") || "{}"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neuroedge_settings_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLocalCache = () => {
    const keep = new Set(["neuroedge_profile_settings", "neuroedge_settings_v2", "neuroedge_theme_pref"]);
    Object.keys(localStorage).forEach((key) => {
      if (!keep.has(key)) localStorage.removeItem(key);
    });
    alert("Cleared local cache (kept profile + core settings).");
  };

  /* -------------------- UI -------------------- */

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "1.25rem",
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#e2e8f0",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            padding: "1rem 1.1rem",
            borderRadius: 14,
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Settings</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
            Founder system configuration and runtime awareness
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          <section style={cardStyle}>
            <h3 style={titleStyle}>Runtime Mode</h3>
            <div style={{ ...rowStyle, marginBottom: "0.45rem" }}>
              <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{runtimeMode}</span>
              <span style={{ color: "#34d399", fontWeight: 600 }}>Local-only</span>
            </div>
            <p style={mutedStyle}>
              NeuroEdge runs as an independent local system. Core chat routing does not require external AI providers.
            </p>
          </section>

          <section style={cardStyle}>
            <h3 style={titleStyle}>Founder Mode</h3>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.founderMode}
                onChange={(e) =>
                  setSettings({ ...settings, founderMode: e.target.checked })
                }
              />
              <span style={{ color: settings.founderMode ? "#34d399" : "#f87171", fontWeight: 600 }}>
                {settings.founderMode ? "Enabled" : "Disabled"}
              </span>
            </label>
            <p style={mutedStyle}>
              Enables founder-aware alerts, commands, and system summaries.
            </p>
          </section>

          <section style={cardStyle}>
            <h3 style={titleStyle}>Voice Alerts (TTS)</h3>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.voiceAlertsEnabled}
                disabled={!ttsAvailable}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    voiceAlertsEnabled: e.target.checked,
                  })
                }
              />
              <span
                style={{
                  color: !ttsAvailable
                    ? "#f87171"
                    : settings.voiceAlertsEnabled
                      ? "#34d399"
                      : "#facc15",
                  fontWeight: 600,
                }}
              >
                {!ttsAvailable
                  ? "Not supported"
                  : settings.voiceAlertsEnabled
                    ? "Enabled"
                    : "Disabled"}
              </span>
            </label>
            <button
              onClick={speakTestMessage}
              disabled={!ttsAvailable || !settings.voiceAlertsEnabled}
              style={{
                marginTop: "0.5rem",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                background: "rgba(15, 23, 42, 0.7)",
                color: "#e2e8f0",
                borderRadius: 10,
                padding: "0.45rem 0.8rem",
                cursor: !ttsAvailable || !settings.voiceAlertsEnabled ? "not-allowed" : "pointer",
                opacity: !ttsAvailable || !settings.voiceAlertsEnabled ? 0.5 : 1,
                fontWeight: 600,
              }}
            >
              Test Voice
            </button>
            <p style={{ ...mutedStyle, marginTop: "0.6rem" }}>
              Used for kernel alerts, failures, and founder summaries.
            </p>
          </section>
        </div>

        <section style={cardStyle}>
          <h3 style={titleStyle}>Kernel Orchestration</h3>
          <label style={{ ...rowStyle, marginBottom: "0.6rem" }}>
            <input
              type="checkbox"
              checked={settings.kernelAutoBalance}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  kernelAutoBalance: e.target.checked,
                })
              }
            />
            <span style={{ fontWeight: 600 }}>Auto Load Balancing</span>
          </label>

          <div style={{ display: "grid", gap: "0.55rem" }}>
            {kernels.length === 0 && (
              <div style={{ ...mutedStyle, background: "rgba(15, 23, 42, 0.7)", borderRadius: 10, padding: "0.7rem" }}>
                No kernel snapshot yet.
              </div>
            )}
            {kernels.map((k) => (
              <div
                key={k.id}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: 12,
                  background: "rgba(15, 23, 42, 0.7)",
                  padding: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ fontFamily: "monospace", fontWeight: 700 }}>{k.id}</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                    v{k.version} • {(k.capabilities || []).join(", ") || "none"}
                  </div>
                </div>
                <div style={{ color: kernelStatusColor(k.status), fontWeight: 700 }}>
                  {k.status}
                </div>
              </div>
            ))}
          </div>

          <p style={{ ...mutedStyle, marginTop: "0.6rem" }}>
            Managed by orchestrator kernelManager (multi-kernel aware).
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          <section style={cardStyle}>
            <h3 style={titleStyle}>Account & Security</h3>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.twoFactorEnabled}
                onChange={(e) => setSettings({ ...settings, twoFactorEnabled: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Two-factor authentication</span>
            </label>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.passkeysEnabled}
                onChange={(e) => setSettings({ ...settings, passkeysEnabled: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Passkeys</span>
            </label>
            <p style={mutedStyle}>
              Login methods supported: guest free mode, email, Google, GitHub, phone (global E.164).
            </p>
          </section>

          <section style={cardStyle}>
            <h3 style={titleStyle}>Notifications</h3>
            <input
              placeholder="Notification email"
              value={settings.notificationEmail}
              onChange={(e) => setSettings({ ...settings, notificationEmail: e.target.value })}
              style={inputStyle}
            />
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Email notifications</span>
            </label>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.pushNotifications}
                onChange={(e) => setSettings({ ...settings, pushNotifications: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Push notifications</span>
            </label>
          </section>

          <section style={cardStyle}>
            <h3 style={titleStyle}>Appearance & Accessibility</h3>
            <select
              value={settings.themeMode}
              onChange={(e) => setSettings({ ...settings, themeMode: e.target.value as SettingsState["themeMode"] })}
              style={inputStyle}
            >
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.reduceMotion}
                onChange={(e) => setSettings({ ...settings, reduceMotion: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Reduce motion</span>
            </label>
            <label style={{ ...rowStyle, marginTop: "0.6rem" }}>
              <span style={{ minWidth: 90 }}>Font scale</span>
              <input
                type="range"
                min={0.85}
                max={1.2}
                step={0.05}
                value={settings.fontScale}
                onChange={(e) => setSettings({ ...settings, fontScale: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
          </section>

          <section style={cardStyle}>
            <h3 style={titleStyle}>Data Controls</h3>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={settings.autoSaveDrafts}
                onChange={(e) => setSettings({ ...settings, autoSaveDrafts: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>Auto-save drafts</span>
            </label>
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
              <button onClick={exportLocalSettings} style={actionBtnStyle}>Export Settings</button>
              <button onClick={clearLocalCache} style={actionBtnStyle}>Clear Local Cache</button>
            </div>
            <p style={mutedStyle}>
              Uses local storage by default; backend services remain available through orchestrator.
            </p>
          </section>
        </div>

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
            <div>
              <h3 style={titleStyle}>Founder</h3>
              <p style={{ ...mutedStyle, marginTop: "0.2rem" }}>
                Joseph Were, Founder and Engineer of Goldege Labs
              </p>
            </div>
            <button
              onClick={() => setContactOpen((v) => !v)}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.3)",
                background: "rgba(15, 23, 42, 0.7)",
                color: "#e2e8f0",
                borderRadius: 10,
                padding: "0.45rem 0.8rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {contactOpen ? "Hide Contact" : "Contact Goldege Labs"}
            </button>
          </div>

          {contactOpen && (
            <div
              style={{
                marginTop: "0.85rem",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: 12,
                background: "rgba(15, 23, 42, 0.7)",
                padding: "0.85rem",
                display: "grid",
                gap: "0.45rem",
              }}
            >
              <a href="mailto:contact@goldegelabs.com" style={linkStyle}>
                Email: contact@goldegelabs.com
              </a>
              <a href="https://goldegelabs.com" target="_blank" rel="noreferrer" style={linkStyle}>
                Website: goldegelabs.com
              </a>
              <a href="https://github.com/josephwere" target="_blank" rel="noreferrer" style={linkStyle}>
                GitHub: github.com/josephwere
              </a>
            </div>
          )}
        </section>

        <footer style={{ color: "#94a3b8", fontSize: "0.78rem", paddingBottom: "0.5rem" }}>
          NeuroEdge © Founder Runtime • Safe-first • Observable • Replaceable
        </footer>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  padding: "1rem 1.1rem",
  borderRadius: 14,
  background: "rgba(15, 23, 42, 0.7)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.98rem",
  color: "#e2e8f0",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  marginTop: "0.6rem",
};

const mutedStyle: React.CSSProperties = {
  margin: "0.45rem 0 0",
  color: "#94a3b8",
  fontSize: "0.82rem",
};

const linkStyle: React.CSSProperties = {
  color: "#e2e8f0",
  textDecoration: "none",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.3)",
  background: "rgba(15, 23, 42, 0.7)",
  color: "#e2e8f0",
  padding: "0.45rem 0.6rem",
};

const actionBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.3)",
  background: "rgba(15, 23, 42, 0.7)",
  color: "#e2e8f0",
  borderRadius: 10,
  padding: "0.45rem 0.8rem",
  cursor: "pointer",
  fontWeight: 600,
};

export default SettingsPanel;
