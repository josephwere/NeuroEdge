// frontend/src/components/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { chatContext } from "@/services/chatContext";

/**
 * NeuroEdge Dashboard
 * Real-time analytics, approvals, AI suggestions
 */

interface MessageStats {
  total: number;
  errors: number;
  warnings: number;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
}

interface AISuggestion {
  id: string;
  suggestion: string;
}

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "degraded";
  detail: string;
}

interface HybridState {
  version: string;
  updatedAt: number;
  summary: Record<string, any>;
}

interface KernelSnapshot {
  name: string;
  status: string;
  version: string;
}

const Dashboard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [messages, setMessages] = useState<MessageStats>({ total: 0, errors: 0, warnings: 0 });
  const [approvals, setApprovals] = useState<ApprovalStats>({ pending: 0, approved: 0, rejected: 0 });
  const [aiSuggestions, setAISuggestions] = useState<AISuggestion[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [hybridState, setHybridState] = useState<HybridState | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [kernels, setKernels] = useState<KernelSnapshot[]>([]);

  /* ---------------- Fetch Stats ---------------- */
  useEffect(() => {
    const allMessages = chatContext.getAll();

    // Messages / Commands
    const total = allMessages.length;
    const errors = allMessages.filter(m => m.role === "assistant" && m.content.startsWith("❌")).length;
    const warnings = allMessages.filter(m => m.role === "assistant" && m.content.startsWith("⚠️")).length;
    setMessages({ total, errors, warnings });

    // Approvals
    const pending = allMessages.filter(m => m.content.includes("[Approval]")).length;
    const approved = allMessages.filter(m => m.content.includes("✅ Approved")).length;
    const rejected = allMessages.filter(m => m.content.includes("❌ Rejected")).length;
    setApprovals({ pending, approved, rejected });

    // AI Suggestions
    const suggestions = allMessages
      .filter(m => m.content.startsWith("🧠 Suggestion"))
      .map((m, idx) => ({ id: idx.toString(), suggestion: m.content }));
    setAISuggestions(suggestions);

  }, []);

  useEffect(() => {
    const orchestratorUrl = (import.meta as any).env?.VITE_ORCHESTRATOR_URL || "http://localhost:7070";
    const kernelUrl = "http://localhost:8080/health";
    const mlUrl = "http://localhost:8090/ready";

    const fetchStatus = async () => {
      const results: ServiceStatus[] = [];

      try {
        const res = await fetch(`${orchestratorUrl}/health`);
        results.push({
          name: "Orchestrator",
          status: res.ok ? "online" : "degraded",
          detail: res.ok ? "Serving API" : "Health endpoint degraded",
        });
      } catch {
        results.push({ name: "Orchestrator", status: "offline", detail: "Not reachable" });
      }

      try {
        const res = await fetch(kernelUrl);
        results.push({
          name: "Kernel",
          status: res.ok ? "online" : "degraded",
          detail: res.ok ? "Kernel responding" : "Kernel degraded",
        });
      } catch {
        results.push({ name: "Kernel", status: "offline", detail: "Not reachable" });
      }

      try {
        const res = await fetch(mlUrl);
        const data = res.ok ? await res.json() : null;
        results.push({
          name: "ML",
          status: res.ok ? "online" : "degraded",
          detail: res.ok ? `Model loaded: ${data?.model_loaded ? "yes" : "no"}` : "ML degraded",
        });
      } catch {
        results.push({ name: "ML", status: "offline", detail: "Not reachable" });
      }

      setServices(results);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const orchestratorUrl = (import.meta as any).env?.VITE_ORCHESTRATOR_URL || "http://localhost:7070";
    const fetchHybrid = async () => {
      try {
        const stateRes = await fetch(`${orchestratorUrl}/storage/state`);
        const stateJson = stateRes.ok ? await stateRes.json() : null;
        setHybridState(stateJson);
      } catch {
        setHybridState(null);
      }
      try {
        const evtRes = await fetch(`${orchestratorUrl}/storage/events?limit=200`);
        const evtJson = evtRes.ok ? await evtRes.json() : [];
        setEventCount(Array.isArray(evtJson) ? evtJson.length : 0);
      } catch {
        setEventCount(0);
      }
    };
    fetchHybrid();
    const interval = setInterval(fetchHybrid, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const orchestratorUrl = (import.meta as any).env?.VITE_ORCHESTRATOR_URL || "http://localhost:7070";
    const fetchKernels = async () => {
      try {
        const res = await fetch(`${orchestratorUrl}/kernels`, { method: "POST" });
        const data = res.ok ? await res.json() : {};
        const entries = Object.entries(data || {});
        const snapshot: KernelSnapshot[] = entries.map(([name, info]: [string, any]) => ({
          name,
          status: info?.status || "unknown",
          version: info?.version || "unknown",
        }));
        setKernels(snapshot);
      } catch {
        setKernels([]);
      }
    };
    fetchKernels();
    const interval = setInterval(fetchKernels, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={pageStyle}>
      <h2 style={{ marginTop: 0 }}>NeuroEdge Dashboard</h2>

      {/* System Status */}
      <div style={widgetStyle}>
        <h3>System Status</h3>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {services.map((s) => (
            <div key={s.name} style={statusRowStyle}>
              <strong>{s.name}</strong>
              <span style={statusPillStyle(s.status)}>{s.status}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{s.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hybrid Storage */}
      <div style={widgetStyle}>
        <h3>Hybrid Database</h3>
        {hybridState ? (
          <div>
            <p>Version: {hybridState.version}</p>
            <p>Updated: {new Date(hybridState.updatedAt).toLocaleString()}</p>
            <p>Recent Events: {eventCount}</p>
          </div>
        ) : (
          <p>Hybrid storage not reachable.</p>
        )}
      </div>

      {/* Kernel Snapshot */}
      <div style={widgetStyle}>
        <h3>Kernel Snapshot</h3>
        {kernels.length === 0 ? (
          <p>No kernel snapshot yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {kernels.map((k) => (
              <div key={k.name} style={statusRowStyle}>
                <strong>{k.name}</strong>
                <span style={statusPillStyle(k.status === "ready" ? "online" : "degraded")}>
                  {k.status}
                </span>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>v{k.version}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages Stats */}
      <div style={widgetStyle}>
        <h3>Messages / Commands</h3>
        <p>Total Messages: {messages.total}</p>
        <p style={{ color: "#f87171" }}>Errors: {messages.errors}</p>
        <p style={{ color: "#facc15" }}>Warnings: {messages.warnings}</p>
      </div>

      {/* Approvals */}
      <div style={widgetStyle}>
        <h3>Approvals</h3>
        <p>Pending: {approvals.pending}</p>
        <p style={{ color: "#34d399" }}>Approved: {approvals.approved}</p>
        <p style={{ color: "#f87171" }}>Rejected: {approvals.rejected}</p>
      </div>

      {/* AI Suggestions */}
      <div style={widgetStyle}>
        <h3>🤖 AI Suggestions</h3>
        {aiSuggestions.length === 0 ? (
          <p>No suggestions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {aiSuggestions.map(s => (
              <button
                key={s.id}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  background: "rgba(15, 23, 42, 0.8)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => addNotification({ message: `Applied suggestion: ${s.suggestion}`, type: "success" })}
              >
                {s.suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------- */
/* Widget Styles */
/* -------------------- */
const pageStyle: React.CSSProperties = {
  padding: "1.5rem",
  overflowY: "auto",
  height: "100%",
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  color: "#e2e8f0",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const widgetStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "1rem",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.7)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
};

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
};

const statusPillStyle = (status: ServiceStatus["status"]): React.CSSProperties => ({
  padding: "0.2rem 0.6rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  textTransform: "uppercase",
  background:
    status === "online"
      ? "rgba(34, 197, 94, 0.18)"
      : status === "degraded"
        ? "rgba(234, 179, 8, 0.18)"
        : "rgba(239, 68, 68, 0.18)",
  color:
    status === "online"
      ? "#86efac"
      : status === "degraded"
        ? "#facc15"
        : "#f87171",
});

export default Dashboard;
