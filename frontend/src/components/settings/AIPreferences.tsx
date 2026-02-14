// frontend/src/components/settings/AIPreferences.tsx
import React from "react";
import { useAIPreferences } from "@/services/aiPreferencesStore";

const AIPreferences: React.FC = () => {
  const { preferences, setPreferences } = useAIPreferences();

  return (
    <div style={{ padding: "1rem", maxWidth: "500px" }}>
      <h2>🧠 AI Response Preferences</h2>

      {/* Temperature */}
      <label style={labelStyle}>Temperature ({preferences.temperature})</label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={preferences.temperature}
        onChange={e =>
          setPreferences({ temperature: parseFloat(e.target.value) })
        }
        style={sliderStyle}
      />

      {/* Verbosity */}
      <label style={labelStyle}>Verbosity</label>
      <select
        value={preferences.verbosity}
        onChange={e =>
          setPreferences({ verbosity: e.target.value as "low" | "medium" | "high" })
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
          onChange={e =>
            setPreferences({ codeFormatting: e.target.checked })
          }
        />{" "}
        Enable code formatting
      </label>

      {/* Explanation Depth */}
      <label style={labelStyle}>Explanation Depth ({preferences.explanationDepth})</label>
      <input
        type="number"
        min={1}
        max={5}
        value={preferences.explanationDepth}
        onChange={e =>
          setPreferences({ explanationDepth: parseInt(e.target.value) })
        }
        style={sliderStyle}
      />

      {/* Safety Strictness */}
      <label style={labelStyle}>Safety Strictness</label>
      <select
        value={preferences.safetyStrictness}
        onChange={e =>
          setPreferences({ safetyStrictness: e.target.value as "low" | "medium" | "high" })
        }
        style={selectStyle}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High (Doctrine enforced)</option>
      </select>
    </div>
  );
};

export default AIPreferences;

/* -------------------- */
/* Styles */
/* -------------------- */
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
  borderRadius: 6,
  border: "1px solid #d1d5db",
};
