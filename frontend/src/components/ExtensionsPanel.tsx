// frontend/src/components/ExtensionsPanel.tsx
import React, { useEffect, useState } from "react";
import { loadExtension } from "@/extensions/extensionLoader";

/** -------------------- Types -------------------- */
export interface Extension {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  permissions: string[];
  version?: string;
}

/** -------------------- ExtensionsPanel Component -------------------- */
const ExtensionsPanel: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>([]);

  // Load initial extensions (mocked, replace with real loader if needed)
  useEffect(() => {
    const initialExtensions: Extension[] = [
      {
        id: "code-linter",
        name: "Code Linter",
        description: "Automatically checks and formats code blocks",
        active: true,
        permissions: ["read-chat", "execute-scripts"],
        version: "1.0.0",
      },
      {
        id: "analytics-plugin",
        name: "Analytics Plugin",
        description: "Provides execution metrics and dashboards",
        active: false,
        permissions: ["read-metrics"],
        version: "0.9.2",
      },
      {
        id: "custom-commands",
        name: "Custom Commands",
        description: "Adds custom commands to the NeuroEdge Command Palette",
        active: true,
        permissions: ["execute-scripts"],
        version: "1.1.0",
      },
    ];
    setExtensions(initialExtensions);
  }, []);

  /** Toggle extension activation */
  const toggleExtension = (id: string) => {
    setExtensions(prev =>
      prev.map(ext => (ext.id === id ? { ...ext, active: !ext.active } : ext))
    );
  };

  /** Demo: Load a new extension dynamically */
  const handleLoadNew = async () => {
    const newExt: Extension = {
      id: "example-extension",
      name: "Example Extension",
      description: "Demonstration extension",
      active: true,
      permissions: ["read-chat"],
      version: "0.1.0",
    };
    // In real use, call loadExtension(newExt, extContext) here
    setExtensions(prev => [...prev, newExt]);
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Runtime Governance</div>
          <h2 style={titleStyle}>🧩 Extensions / Plugins</h2>
          <p style={subtitleStyle}>
            Manage mini-modules safely: activate, deactivate, or load new ones.
          </p>
        </div>
        <button onClick={handleLoadNew} style={primaryActionStyle}>
          ➕ Load New Extension
        </button>
      </div>

      <div style={listStyle}>
        {extensions.map(ext => (
          <div key={ext.id} style={cardStyle(ext.active)}>
            <div>
              <div style={cardTitleStyle}>{ext.name}</div>
              {ext.description && (
                <div style={cardSubtitleStyle}>
                  {ext.description} {ext.version && `v${ext.version}`}
                </div>
              )}
              <div style={cardMetaStyle}>
                Permissions: {ext.permissions.join(", ") || "None"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
              <span style={statusPillStyle(ext.active)}>{ext.active ? "Active" : "Inactive"}</span>
              <button onClick={() => toggleExtension(ext.id)} style={actionButtonStyle(ext.active)}>
                {ext.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtensionsPanel;

const pageStyle: React.CSSProperties = {
  padding: "1.5rem",
  height: "100%",
  overflowY: "auto",
  color: "var(--ne-text)",
  background: "linear-gradient(180deg, rgba(37, 99, 235, 0.08) 0%, var(--ne-bg) 60%)",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  marginBottom: "1.5rem",
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  fontSize: "0.65rem",
  color: "var(--ne-muted)",
};

const titleStyle: React.CSSProperties = {
  margin: "0.35rem 0 0.35rem",
  fontSize: "1.4rem",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--ne-muted)",
};

const primaryActionStyle: React.CSSProperties = {
  padding: "0.55rem 1rem",
  background: "#2563eb",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  borderRadius: 10,
  fontSize: "0.85rem",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const cardStyle = (active: boolean): React.CSSProperties => ({
  padding: "1rem",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: active ? "rgba(37, 99, 235, 0.12)" : "var(--ne-surface)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.15)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
});

const cardTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "1rem",
};

const cardSubtitleStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--ne-muted)",
};

const cardMetaStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--ne-muted)",
};

const statusPillStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.2rem 0.6rem",
  borderRadius: 999,
  background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.2)",
  color: active ? "#10b981" : "var(--ne-muted)",
  fontSize: "0.7rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
});

const actionButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.4rem 0.75rem",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: active ? "#ef4444" : "#2563eb",
  color: "#fff",
  fontSize: "0.8rem",
});
