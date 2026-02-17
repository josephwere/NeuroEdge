import React, { useEffect, useMemo, useState } from "react";
import {
  ProjectItem,
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from "@/services/projectStore";
import { confirmSafeAction, recoveryGuidance } from "@/services/safetyPrompts";

const ProjectsPanel: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");

  const refresh = () => setProjects(listProjects());

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("neuroedge:projectsUpdated", onUpdate as EventListener);
    return () =>
      window.removeEventListener(
        "neuroedge:projectsUpdated",
        onUpdate as EventListener
      );
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)
    );
  }, [projects, query]);

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Execution Workspace</div>
          <h2 style={titleStyle}>My Projects</h2>
        </div>
      </div>

      <div style={composerStyle}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          style={inputStyle}
        />
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Short summary"
          style={inputStyle}
        />
        <button
          style={createBtn}
          onClick={() => {
            createProject(name, summary);
            setName("");
            setSummary("");
            refresh();
          }}
        >
          Create
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search projects..."
        style={searchStyle}
      />

      <div style={gridStyle}>
        {filtered.map((p) => (
          <div key={p.id} style={cardStyle}>
            <div style={cardTopStyle}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={metaStyle}>
                  Updated {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              <select
                value={p.status}
                onChange={(e) =>
                  updateProject(p.id, {
                    status: e.target.value as ProjectItem["status"],
                  })
                }
                style={statusStyle}
              >
                <option value="active">active</option>
                <option value="planning">planning</option>
                <option value="paused">paused</option>
              </select>
            </div>
            <div style={summaryStyle}>{p.summary}</div>
            <div style={{ marginTop: "0.65rem", display: "flex", justifyContent: "space-between" }}>
              <button
                style={tinyBtn}
                onClick={() => {
                  const nextName = window.prompt("Project name", p.name);
                  if (nextName === null) return;
                  const nextSummary = window.prompt("Project summary", p.summary);
                  if (nextSummary === null) return;
                  updateProject(p.id, { name: nextName, summary: nextSummary });
                }}
              >
                Edit
              </button>
              <button
                style={dangerBtn}
                onClick={() => {
                  if (!confirmSafeAction({ title: p.name, actionLabel: "delete project" })) return;
                  deleteProject(p.id);
                  window.alert(recoveryGuidance("Project"));
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  padding: "1.2rem 1.4rem",
  height: "100%",
  overflowY: "auto",
  background:
    "radial-gradient(circle at 92% -10%, rgba(6,182,212,0.2), transparent 35%), linear-gradient(180deg,#0f172a,#0b1220)",
  color: "#e2e8f0",
};
const headerStyle: React.CSSProperties = { marginBottom: "0.8rem" };
const eyebrowStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#94a3b8",
};
const titleStyle: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "1.45rem" };
const composerStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "0.55rem", marginBottom: "0.8rem" };
const inputStyle: React.CSSProperties = {
  padding: "0.55rem 0.65rem",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.74)",
  color: "#e2e8f0",
};
const createBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "#0ea5e9",
  color: "#fff",
  padding: "0.55rem 0.8rem",
  cursor: "pointer",
};
const searchStyle: React.CSSProperties = { ...inputStyle, width: "100%", marginBottom: "0.85rem" };
const gridStyle: React.CSSProperties = { display: "grid", gap: "0.65rem", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" };
const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  background: "rgba(15,23,42,0.7)",
  padding: "0.8rem",
  boxShadow: "0 8px 24px rgba(2,6,23,0.36)",
};
const cardTopStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" };
const metaStyle: React.CSSProperties = { fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.12rem" };
const summaryStyle: React.CSSProperties = { marginTop: "0.55rem", color: "#cbd5e1", lineHeight: 1.5, minHeight: 48 };
const statusStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(15,23,42,0.86)",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "0.25rem 0.5rem",
};
const tinyBtn: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
  background: "transparent",
  color: "#e2e8f0",
  cursor: "pointer",
  padding: "0.3rem 0.55rem",
};
const dangerBtn: React.CSSProperties = {
  ...tinyBtn,
  border: "1px solid rgba(248,113,113,0.45)",
  color: "#fecaca",
};

export default ProjectsPanel;
