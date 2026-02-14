// frontend/src/components/SettingsPanel.tsx
import React from "react";
import { useAIPreferences } from "@/services/aiPreferencesStore";

const SettingsPanel: React.FC = () => {
  const { preferences, setPreferences } = useAIPreferences();

  /* -------------------- Handlers -------------------- */
  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    document.documentElement.setAttribute(
      "data-theme",
      current === "light" ? "dark" : "light"
    );
  };

  const clearMemory = () => {
    if (confirm("Clear chat memory and local preferences?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  /* -------------------- Render -------------------- */
  return (
    <div style={{ padding: "1rem", maxWidth: "600px" }}>
      <h1>⚙️ Settings</h1>

      {/* -------------------- Theme -------------------- */}
      <section style={sectionStyle}>
        <h2>🌗 Appearance</h2>
        <button onClick={toggleTheme} style={buttonStyle}>
          Toggle Light / Dark Theme
        </button>
      </section>

      {/* -------------------- AI Preferences -------------------- */}
      <section style={sectionStyle}>
        <h2>🧠 AI Preferences</h2>

        {/* Temperature */}
        <label style={labelStyle}>
          Temperature ({preferences.temperature})
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={preferences.temperature}
          onChange={(e) =>
            setPreferences({ temperature: parseFloat(e.target.value) })
          }
          style={sliderStyle}
        />

        {/* Verbosity */}
        <label style={labelStyle}>Verbosity</label>
        <select
          value={preferences.verbosity}
          onChange={(e) =>
            setPreferences({ verbosity: e.target.value as any })
          }
          style={selectStyle}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {/* Code Formatting */}
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={preferences.codeFormatting}
            onChange={(e) =>
              setPreferences({ codeFormatting: e.target.checked })
            }
          />{" "}
          Enable code formatting
        </label>

        {/* Explanation Depth */}
        <label style={labelStyle}>
          Explanation Depth ({preferences.explanationDepth})
        </label>
        <input
          type="number"
          min={1}
          max={5}
          value={preferences.explanationDepth}
          onChange={(e) =>
            setPreferences({ explanationDepth: parseInt(e.target.value) })
          }
          style={sliderStyle}
        />

        {/* Safety Strictness */}
        <label style={labelStyle}>Safety Strictness</label>
        <select
          value={preferences.safetyStrictness}
          onChange={(e) =>
            setPreferences({ safetyStrictness: e.target.value as any })
          }
          style={selectStyle}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High (Doctrine enforced)</option>
        </select>
      </section>

      {/* -------------------- Privacy & Memory -------------------- */}
      <section style={sectionStyle}>
        <h2>🔒 Privacy & Memory</h2>
        <button onClick={clearMemory} style={buttonStyle}>
          Clear Chat Memory / Local Preferences
        </button>
        <p style={{ fontSize: "0.8rem", color: "#555" }}>
          This will remove all local chat history and preferences. Online data
          may remain if synced.
        </p>
      </section>

      {/* -------------------- Extensions Placeholder -------------------- */}
      <section style={sectionStyle}>
        <h2>🧩 Extensions & Plugins</h2>
        <p style={{ color: "#555", fontSize: "0.85rem" }}>
          Install mini-modules or custom commands (future-ready).
        </p>
      </section>
    </div>
  );
};

export default SettingsPanel;

/* -------------------- Styles -------------------- */
const sectionStyle: React.CSSProperties = {
  marginTop: "1.5rem",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  background: "#fafafa",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: "1rem",
  marginBottom: "0.25rem",
  fontWeight: 500,
};

const sliderStyle: React.CSSProperties = {
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "#3a3aff",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
};
