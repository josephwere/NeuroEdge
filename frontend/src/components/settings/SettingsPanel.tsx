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
  /* -------------------- State -------------------- */

  const [settings, setSettings] = useState<SettingsState>({
    founderMode: true,
    voiceAlertsEnabled: true,
    preferredVoice: "default",
    kernelAutoBalance: true,
  });

  const [kernels, setKernels] = useState<KernelInfo[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);

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

  /* -------------------- UI -------------------- */

  return (
    <div className="settings-panel p-4 text-sm text-gray-200 space-y-6">
      {/* ================= Header ================= */}
      <div>
        <h2 className="text-lg font-semibold">⚙️ NeuroEdge Settings</h2>
        <p className="opacity-70">
          Founder system configuration & runtime awareness
        </p>
      </div>

      {/* ================= Founder Mode ================= */}
      <section>
        <h3 className="font-medium mb-2">Founder Mode</h3>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.founderMode}
            onChange={(e) =>
              setSettings({ ...settings, founderMode: e.target.checked })
            }
          />
          <span>
            {settings.founderMode ? (
              <span className="text-green-400">Enabled</span>
            ) : (
              <span className="text-red-400">Disabled</span>
            )}
          </span>
        </div>
        <p className="opacity-60 mt-1">
          Enables founder-aware alerts, commands, and system summaries.
        </p>
      </section>

      {/* ================= Voice / TTS ================= */}
      <section>
        <h3 className="font-medium mb-2">Voice Alerts (TTS)</h3>

        <div className="flex items-center gap-3 mb-2">
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
          <span>
            {ttsAvailable ? (
              settings.voiceAlertsEnabled ? (
                <span className="text-green-400">Enabled</span>
              ) : (
                <span className="text-yellow-400">Disabled</span>
              )
            ) : (
              <span className="text-red-400">Not supported</span>
            )}
          </span>
        </div>

        <button
          onClick={speakTestMessage}
          disabled={!ttsAvailable || !settings.voiceAlertsEnabled}
          className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40"
        >
          🔊 Test Voice
        </button>

        <p className="opacity-60 mt-1">
          Used for kernel alerts, failures, and founder summaries.
        </p>
      </section>

      {/* ================= Kernel Management ================= */}
      <section>
        <h3 className="font-medium mb-2">Kernel Orchestration</h3>

        <div className="mb-2">
          <label className="block opacity-70 mb-1">
            Auto Load Balancing
          </label>
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
        </div>

        <div className="space-y-2">
          {kernels.map((k) => (
            <div
              key={k.id}
              className="flex justify-between border border-gray-700 p-2 rounded"
            >
              <div>
                <div className="font-mono">{k.id}</div>
                <div className="text-xs opacity-60">
                  {k.capabilities.join(", ")}
                </div>
              </div>

              <div
                className={
                  k.status === "ready"
                    ? "text-green-400"
                    : k.status === "degraded"
                    ? "text-yellow-400"
                    : "text-red-400"
                }
              >
                {k.status}
              </div>
            </div>
          ))}
        </div>

        <p className="opacity-60 mt-2">
          Managed by orchestrator kernelManager (multi-kernel aware).
        </p>
      </section>

      {/* ================= Footer ================= */}
      <footer className="opacity-50 text-xs">
        NeuroEdge © Founder Runtime • Safe-first • Observable • Replaceable
      </footer>
    </div>
  );
};

export default SettingsPanel;
