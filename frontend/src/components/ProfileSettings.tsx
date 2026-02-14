// frontend/src/components/ProfileSettings.tsx

import React, { useEffect, useState } from "react";

/* -------------------- */
/* Types */
/* -------------------- */

type ThemeMode = "light" | "dark" | "system";
type Verbosity = "concise" | "balanced" | "detailed";

interface ProfileSettingsState {
  name: string;
  email: string;
  mode: "guest" | "local" | "account";

  theme: ThemeMode;

  aiVerbosity: Verbosity;
  autoExplainCode: boolean;
  safeExecution: boolean;

  memoryEnabled: boolean;
  localOnly: boolean;
}

/* -------------------- */
/* Defaults */
/* -------------------- */

const DEFAULT_SETTINGS: ProfileSettingsState = {
  name: "Guest User",
  email: "",
  mode: "guest",

  theme: "system",

  aiVerbosity: "balanced",
  autoExplainCode: true,
  safeExecution: true,

  memoryEnabled: true,
  localOnly: true,
};

/* -------------------- */
/* Component */
/* -------------------- */

const ProfileSettings: React.FC = () => {
  const [settings, setSettings] =
    useState<ProfileSettingsState>(DEFAULT_SETTINGS);

  /* ---------------- Load ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("neuroedge_profile_settings");
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  /* ---------------- Save ---------------- */
  useEffect(() => {
    localStorage.setItem(
      "neuroedge_profile_settings",
      JSON.stringify(settings)
    );
  }, [settings]);

  /* ---------------- Helpers ---------------- */
  const update = <K extends keyof ProfileSettingsState>(
    key: K,
    value: ProfileSettingsState[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const clearMemory = () => {
    localStorage.removeItem("chat_context");
    localStorage.removeItem("floating_chat_logs");
    alert("Local NeuroEdge memory cleared.");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={container}>
      <h2 style={title}>Profile & Settings</h2>

      {/* ---------- Profile ---------- */}
      <Section title="Profile">
        <Row label="Name">
          <input
            value={settings.name}
            onChange={e => update("name", e.target.value)}
            style={input}
          />
        </Row>

        <Row label="Email (optional)">
          <input
            value={settings.email}
            onChange={e => update("email", e.target.value)}
            style={input}
          />
        </Row>

        <Row label="Mode">
          <span style={badge}>
            {settings.mode.toUpperCase()}
          </span>
        </Row>
      </Section>

      {/* ---------- Appearance ---------- */}
      <Section title="Appearance">
        <Row label="Theme">
          <select
            value={settings.theme}
            onChange={e =>
              update("theme", e.target.value as ThemeMode)
            }
            style={input}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
      </Section>

      {/* ---------- AI Preferences ---------- */}
      <Section title="AI Preferences">
        <Row label="Response verbosity">
          <select
            value={settings.aiVerbosity}
            onChange={e =>
              update("aiVerbosity", e.target.value as Verbosity)
            }
            style={input}
          >
            <option value="concise">Concise</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
        </Row>

        <Toggle
          label="Auto-explain code"
          checked={settings.autoExplainCode}
          onChange={v => update("autoExplainCode", v)}
        />

        <Toggle
          label="Safe execution mode"
          checked={settings.safeExecution}
          onChange={v => update("safeExecution", v)}
        />
      </Section>

      {/* ---------- Privacy ---------- */}
      <Section title="Privacy & Memory">
        <Toggle
          label="Enable conversation memory"
          checked={settings.memoryEnabled}
          onChange={v => update("memoryEnabled", v)}
        />

        <Toggle
          label="Local-only mode (no sync)"
          checked={settings.localOnly}
          onChange={v => update("localOnly", v)}
        />

        <button style={dangerButton} onClick={clearMemory}>
          Clear local memory
        </button>

        <p style={warning}>
          NeuroEdge does not store or learn from your data unless you
          explicitly allow it.
        </p>
      </Section>
    </div>
  );
};

export default ProfileSettings;

/* -------------------- */
/* UI Primitives */
/* -------------------- */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={section}>
    <h3 style={sectionTitle}>{title}</h3>
    {children}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div style={row}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <Row label={label}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
    />
  </Row>
);

/* -------------------- */
/* Styles */
/* -------------------- */

const container: React.CSSProperties = {
  padding: "2rem",
  maxWidth: "720px",
};

const title: React.CSSProperties = {
  marginBottom: "1.5rem",
};

const section: React.CSSProperties = {
  marginBottom: "2rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid #ddd",
};

const sectionTitle: React.CSSProperties = {
  marginBottom: "1rem",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.75rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.9rem",
};

const input: React.CSSProperties = {
  padding: "0.4rem",
  minWidth: "200px",
};

const badge: React.CSSProperties = {
  padding: "4px 8px",
  background: "#3a3aff",
  color: "#fff",
  borderRadius: "6px",
  fontSize: "0.75rem",
};

const dangerButton: React.CSSProperties = {
  marginTop: "0.75rem",
  background: "#ff4d4f",
  color: "#fff",
  border: "none",
  padding: "0.5rem 0.75rem",
  borderRadius: "6px",
  cursor: "pointer",
};

const warning: React.CSSProperties = {
  marginTop: "0.5rem",
  fontSize: "0.75rem",
  opacity: 0.7,
};
