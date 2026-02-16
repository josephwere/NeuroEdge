import React, { useMemo, useState } from "react";

interface TutorialStep {
  title: string;
  subtitle: string;
  detail: string;
  tip: string;
  icon: string;
}

interface TutorialGuideProps {
  open: boolean;
  onSkip: () => void;
  onFinish: () => void;
}

const STEPS: TutorialStep[] = [
  {
    icon: "✦",
    title: "Welcome to NeuroEdge",
    subtitle: "Your AI-first workspace is ready.",
    detail:
      "NeuroEdge blends command execution, diagnostics, and AI reasoning in one unified interface.",
    tip: "Tip: Keep this guide open and click through once. You can skip anytime.",
  },
  {
    icon: "💬",
    title: "Use Main Chat",
    subtitle: "Ask, debug, run, and reason.",
    detail:
      "Type natural requests in chat. NeuroEdge routes to orchestrator, kernel, and ML while showing reasoning and results.",
    tip: "Tip: Press Enter to send. Use concise commands for faster outputs.",
  },
  {
    icon: "🪟",
    title: "Open Floating Assistant",
    subtitle: "Quick side panel, on demand.",
    detail:
      "Click the floating launcher icon to open the assistant panel. Keep it hidden when you want a clean workspace.",
    tip: "Tip: Use close/minimize controls in the floating header.",
  },
  {
    icon: "⚙️",
    title: "Tune Settings",
    subtitle: "Founder mode and voice controls.",
    detail:
      "In Settings, manage Founder Mode, TTS alerts, and kernel orchestration options to fit your workflow.",
    tip: "Tip: Run a voice test after enabling TTS.",
  },
  {
    icon: "📊",
    title: "Monitor Runtime",
    subtitle: "Track health and performance.",
    detail:
      "Use Dashboard and notifications to watch system status, execution quality, and critical alerts in real time.",
    tip: "Tip: Keep notifications focused by avoiding repeated demo alerts.",
  },
];

const TutorialGuide: React.FC<TutorialGuideProps> = ({ open, onSkip, onFinish }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const step = useMemo(() => STEPS[stepIndex], [stepIndex]);
  const isLast = stepIndex === STEPS.length - 1;

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.58)",
        backdropFilter: "blur(6px)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "min(760px, 96vw)",
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 24px 64px rgba(2, 6, 23, 0.44)",
          background:
            "linear-gradient(150deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 55%, rgba(37,99,235,0.35) 100%)",
          color: "#e2e8f0",
        }}
      >
        <div style={{ padding: "1.15rem 1.3rem", borderBottom: "1px solid rgba(148,163,184,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(56, 189, 248, 0.16)",
                  border: "1px solid rgba(56,189,248,0.45)",
                  fontWeight: 700,
                }}
              >
                {step.icon}
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>NeuroEdge Tour</div>
            </div>
            <button
              onClick={onSkip}
              style={{
                border: "1px solid rgba(148,163,184,0.45)",
                background: "transparent",
                color: "#cbd5e1",
                borderRadius: 10,
                padding: "0.38rem 0.72rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Skip
            </button>
          </div>
        </div>

        <div style={{ padding: "1.4rem 1.3rem 1rem" }}>
          <div style={{ fontSize: "1.28rem", fontWeight: 800, color: "#f8fafc" }}>{step.title}</div>
          <div style={{ marginTop: "0.3rem", color: "#cbd5e1", fontWeight: 600 }}>{step.subtitle}</div>
          <p style={{ marginTop: "0.8rem", color: "#e2e8f0", lineHeight: 1.55 }}>{step.detail}</p>
          <div
            style={{
              marginTop: "0.85rem",
              border: "1px solid rgba(56,189,248,0.35)",
              background: "rgba(14, 116, 144, 0.16)",
              borderRadius: 12,
              padding: "0.68rem 0.75rem",
              color: "#bae6fd",
              fontSize: "0.9rem",
            }}
          >
            {step.tip}
          </div>
        </div>

        <div
          style={{
            padding: "0.95rem 1.3rem 1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            borderTop: "1px solid rgba(148,163,184,0.25)",
          }}
        >
          <div style={{ display: "flex", gap: "0.45rem" }}>
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: idx === stepIndex ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: idx === stepIndex ? "#38bdf8" : "rgba(148,163,184,0.45)",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <button
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
              style={{
                border: "1px solid rgba(148,163,184,0.45)",
                background: "transparent",
                color: "#cbd5e1",
                borderRadius: 10,
                padding: "0.42rem 0.75rem",
                cursor: stepIndex === 0 ? "not-allowed" : "pointer",
                opacity: stepIndex === 0 ? 0.45 : 1,
                fontWeight: 600,
              }}
            >
              Back
            </button>
            <button
              onClick={() => (isLast ? onFinish() : setStepIndex((s) => Math.min(STEPS.length - 1, s + 1)))}
              style={{
                border: "none",
                background: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 90%)",
                color: "#fff",
                borderRadius: 10,
                padding: "0.44rem 0.9rem",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 8px 20px rgba(37, 99, 235, 0.38)",
              }}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialGuide;
