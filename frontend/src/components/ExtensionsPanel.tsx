import React, { useEffect, useMemo, useState } from "react";

export interface Extension {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  permissions: string[];
  version?: string;
}

const ExtensionsPanel: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [permissionsText, setPermissionsText] = useState("read-chat");

  const baseUrl = useMemo(
    () => String(import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:7070").replace(/\/$/, ""),
    []
  );

  const fetchExtensions = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${baseUrl}/admin/dashboard/extensions`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      setExtensions(Array.isArray(data.extensions) ? data.extensions : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load extensions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExtensions();
  }, []);

  const callAction = async (path: string, body: Record<string, any>) => {
    setError("");
    const resp = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setExtensions(Array.isArray(data.extensions) ? data.extensions : []);
  };

  const toggleExtension = async (id: string) => {
    try {
      await callAction("/admin/dashboard/extensions/toggle", { id });
    } catch (err: any) {
      setError(err?.message || "Toggle failed");
    }
  };

  const deleteExtension = async (id: string) => {
    try {
      await callAction("/admin/dashboard/extensions/delete", { id });
    } catch (err: any) {
      setError(err?.message || "Delete failed");
    }
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Extension name is required");
      return;
    }
    const permissions = permissionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await callAction("/admin/dashboard/extensions/upsert", {
        extension: {
          name: trimmedName,
          description: description.trim(),
          version: version.trim() || "1.0.0",
          permissions,
          active: true,
        },
      });
      setName("");
      setDescription("");
      setVersion("1.0.0");
      setPermissionsText("read-chat");
    } catch (err: any) {
      setError(err?.message || "Create failed");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Runtime Governance</div>
          <h2 style={titleStyle}>🧩 Extensions / Plugins</h2>
          <p style={subtitleStyle}>Manage extension lifecycle from orchestrator state.</p>
        </div>
        <button onClick={fetchExtensions} style={secondaryActionStyle} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={createCardStyle}>
        <div style={cardTitleStyle}>Create Extension</div>
        <div style={formGridStyle}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Extension name" style={inputStyle} />
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version (e.g. 1.0.0)" style={inputStyle} />
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={inputStyle} />
        <input
          value={permissionsText}
          onChange={(e) => setPermissionsText(e.target.value)}
          placeholder="Permissions comma-separated"
          style={inputStyle}
        />
        <button onClick={handleCreate} style={primaryActionStyle}>➕ Load New Extension</button>
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={listStyle}>
        {extensions.map((ext) => (
          <div key={ext.id} style={cardStyle(ext.active)}>
            <div>
              <div style={cardTitleStyle}>{ext.name}</div>
              {ext.description ? <div style={cardSubtitleStyle}>{ext.description} {ext.version ? `v${ext.version}` : ""}</div> : null}
              <div style={cardMetaStyle}>Permissions: {(ext.permissions || []).join(", ") || "None"}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={statusPillStyle(ext.active)}>{ext.active ? "Active" : "Inactive"}</span>
              <button onClick={() => toggleExtension(ext.id)} style={actionButtonStyle(ext.active)}>
                {ext.active ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => deleteExtension(ext.id)} style={dangerButtonStyle}>
                Delete
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
  color: "#e2e8f0",
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
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
  color: "#94a3b8",
};

const titleStyle: React.CSSProperties = {
  margin: "0.35rem 0 0.35rem",
  fontSize: "1.4rem",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
};

const createCardStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  marginBottom: "1rem",
  padding: "1rem",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(15, 23, 42, 0.75)",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  gridTemplateColumns: "1fr 180px",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: "rgba(15, 23, 42, 0.6)",
  color: "#e2e8f0",
  borderRadius: 10,
  padding: "0.55rem 0.7rem",
  fontSize: "0.85rem",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
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

const secondaryActionStyle: React.CSSProperties = {
  padding: "0.55rem 1rem",
  background: "rgba(30,41,59,0.85)",
  border: "1px solid rgba(148,163,184,0.25)",
  color: "#e2e8f0",
  cursor: "pointer",
  borderRadius: 10,
  fontSize: "0.85rem",
};

const cardStyle = (active: boolean): React.CSSProperties => ({
  padding: "1rem",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: active ? "rgba(37, 99, 235, 0.18)" : "rgba(15, 23, 42, 0.7)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
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
  color: "#94a3b8",
};

const cardMetaStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#94a3b8",
};

const statusPillStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.2rem 0.6rem",
  borderRadius: 999,
  background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.2)",
  color: active ? "#10b981" : "#94a3b8",
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

const dangerButtonStyle: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.3)",
  cursor: "pointer",
  background: "rgba(239,68,68,0.15)",
  color: "#fca5a5",
  fontSize: "0.8rem",
};

const errorStyle: React.CSSProperties = {
  color: "#fecaca",
  background: "rgba(127,29,29,0.35)",
  border: "1px solid rgba(248,113,113,0.4)",
  borderRadius: 10,
  padding: "0.6rem 0.8rem",
  marginBottom: "0.8rem",
  fontSize: "0.85rem",
};
