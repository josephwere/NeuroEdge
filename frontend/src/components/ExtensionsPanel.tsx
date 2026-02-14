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
    <div style={{ padding: "1.5rem", height: "100%", overflowY: "auto" }}>
      <h2>🧩 Extensions / Plugins</h2>
      <p style={{ color: "#555", marginBottom: "1rem" }}>
        Manage mini-modules safely: activate, deactivate, or load new ones.
      </p>

      <button
        onClick={handleLoadNew}
        style={{
          padding: "0.5rem 1rem",
          marginBottom: "1rem",
          background: "#3a3aff",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        ➕ Load New Extension
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {extensions.map(ext => (
          <div
            key={ext.id}
            style={{
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
              background: ext.active ? "#f0f4ff" : "#f9f9f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{ext.name}</div>
              {ext.description && (
                <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                  {ext.description} {ext.version && `v${ext.version}`}
                </div>
              )}
              <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                Permissions: {ext.permissions.join(", ") || "None"}
              </div>
            </div>

            <button
              onClick={() => toggleExtension(ext.id)}
              style={{
                padding: "0.3rem 0.6rem",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: ext.active ? "#ff4d4f" : "#3a3aff",
                color: "#fff",
              }}
            >
              {ext.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtensionsPanel;
