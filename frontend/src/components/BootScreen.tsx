import React, { useEffect, useState } from "react";
import { useNotifications } from "@/stores/notificationStore"; // ✅ hook to trigger notifications

interface BootScreenProps {
  onDone: () => void;
}

interface BootLog {
  id: number;
  message: string;
}

interface FloatingHint {
  id: number;
  message: string;
  x: number;
  y: number;
}

const modules = [
  "Kernel Core",
  "ML Engine",
  "Command Router",
  "Memory Manager",
  "AI Personality",
  "Cache System",
  "Network Node",
  "User Interface",
];

const aiHints = [
  "Hello, I’m NeuroEdge 🤖",
  "Initializing AI personality...",
  "Preparing your workspace...",
  "I’ll assist with everything you need.",
  "All systems nominal.",
  "Checking Kernel nodes…",
  "Loading AI models…",
  "Ready to go!",
];

const BootScreen: React.FC<BootScreenProps> = ({ onDone }) => {
  const [progress, setProgress] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [logs, setLogs] = useState<BootLog[]>([]);
  const [hints, setHints] = useState<FloatingHint[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const { addNotification } = useNotifications(); // ✅ Get notification hook

  useEffect(() => {
    if (animatedProgress < progress) {
      const id = setInterval(() => setAnimatedProgress(p => Math.min(p + 1, progress)), 10);
      return () => clearInterval(id);
    }
  }, [progress, animatedProgress]);

  useEffect(() => {
    let logId = 0;
    let hintId = 0;

    const addLog = (msg: string) => setLogs(prev => [...prev, { id: logId++, message: msg }]);
    const addHint = (msg: string) =>
      setHints(prev => [...prev, { id: hintId++, message: msg, x: Math.random() * 80 + 10, y: Math.random() * 70 + 10 }]);

    let offline = false; // track if we started offline

    const simulateModules = async () => {
      for (let i = 0; i < modules.length; i++) {
        for (let j = 0; j <= 10; j++) {
          await new Promise(r => setTimeout(r, 45));
          setProgress(Math.floor(((i + j / 10) / modules.length) * 85));
        }
        addLog(`✔ ${modules[i]} initialized`);
        addHint(aiHints[i % aiHints.length]);
      }
    };

    const checkKernelHealth = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch("/api/health", { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) addLog("✔ Kernel online");
        else throw new Error("Kernel unhealthy");
      } catch {
        offline = true;
        setWarning("Backend not connected — running in Offline Mode");
        addLog("⚠ Kernel unreachable (offline mode)");
        addNotification({ message: "Running offline. Kernel not reachable", type: "warn" });
      }
    };

    const pollKernelOnline = async () => {
      if (!offline) return; // already online
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          offline = false;
          setWarning(null);
          addLog("✔ Kernel now online");
          addNotification({ message: "Kernel is now online ✅", type: "success" });
        }
      } catch {}
    };

    const runBoot = async () => {
      await simulateModules();
      await checkKernelHealth();
      setProgress(100);
      addHint("NeuroEdge online 🚀");
      setTimeout(onDone, 800);

      // Poll every 5s if backend comes online
      const interval = setInterval(pollKernelOnline, 5000);
      return () => clearInterval(interval);
    };

    runBoot();
  }, [onDone, addNotification]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#1e1e2f", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "monospace", zIndex: 9999, overflow: "hidden" }}>
      <div style={{ marginBottom: "1rem", fontSize: "1.3rem" }}>{animatedProgress < 100 ? "Booting NeuroEdge…" : "Finalizing…"}</div>
      <div style={{ width: "60%", height: "14px", background: "#333", borderRadius: "7px", overflow: "hidden" }}>
        <div style={{ width: `${animatedProgress}%`, height: "100%", background: "#3a3aff", transition: "width 0.05s linear" }} />
      </div>
      <div style={{ fontSize: "0.85rem", opacity: 0.7, margin: "0.5rem 0 1rem" }}>{animatedProgress}%</div>
      <div style={{ width: "60%", maxHeight: "25vh", overflowY: "auto", background: "#2b2b3c", padding: "0.75rem", borderRadius: "8px", fontSize: "0.8rem" }}>
        {logs.map(l => (<div key={l.id} style={{ marginBottom: "0.25rem", opacity: 0, animation: "fadeIn 0.4s forwards" }}>{l.message}</div>))}
      </div>
      {hints.map(h => (<div key={h.id} style={{ position: "absolute", top: `${h.y}%`, left: `${h.x}%`, background: "rgba(58, 58, 255, 0.2)", padding: "0.3rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", animation: "hintFade 2s ease-in-out" }}>{h.message}</div>))}
      {warning && <div style={{ position: "absolute", bottom: 20, color: "#facc15", fontSize: "0.8rem" }}>⚠ {warning}</div>}
      <style>{`@keyframes fadeIn{to{opacity:1}} @keyframes hintFade{0%,100%{opacity:0;transform:translateY(-6px)}50%{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
};

export default BootScreen;
