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
  });

  const [kernels, setKernels] = useState<KernelInfo[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  /* -------------------- Lifecycle -------------------- */

  useEffect(() => {
    console.log("[NeuroEdge] SettingsPanel mounted");

    detectTTS();
    loadKernelSnapshot();
  }, []);

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

export default SettingsPanel;
