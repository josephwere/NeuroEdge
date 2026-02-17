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
      "NeuroEdge blends chat, orchestration, security operations, media creation, and governance in one unified platform.",
    tip: "Tip: Keep this guide open and click through once. You can skip anytime.",
  },
  {
    icon: "💬",
    title: "Use Main Chat + Floating Chat",
    subtitle: "Ask, debug, run, and reason from either surface.",
    detail:
      "Use the main chat for deep sessions and floating chat for quick context. Both support modern input patterns, attachments, and guided responses.",
    tip: "Tip: Press Enter to send. Use concise requests for faster execution.",
  },
  {
    icon: "🧭",
    title: "Dashboard Search Assistant",
    subtitle: "Find anything instantly across all dashboards.",
    detail:
      "Inside Dashboard, use Search Assistant to ask where a feature lives. It routes Founder/Admin/Dev/User/Enterprise to the exact section.",
    tip: "Tip: Try queries like: rollback, api key, twin report, billing, sso, creator.",
  },
  {
    icon: "👑",
    title: "Role-Aware Dashboards",
    subtitle: "Each role sees what is relevant.",
    detail:
      "Founder has full command center access. Admin handles moderation and operations. Developer focuses API/tools. User gets clean product flow. Enterprise gets governance and compliance controls.",
    tip: "Tip: Founder can switch and test all role dashboards from one account.",
  },
  {
    icon: "🛡",
    title: "Aegis Shield System",
    subtitle: "Security, resilience, and recovery controls.",
    detail:
      "Use Aegis for anti-theft flags, loan restricted mode, malware scanning, prompt-shield checks, integrity baseline/check, safe mode, snapshots, rollback, backup, and zero-trust key rotation.",
    tip: "Tip: Always create a snapshot before major changes or rollback tests.",
  },
  {
    icon: "🧠",
    title: "Twin Systems + NeuroTwin",
    subtitle: "System intelligence and founder digital twin.",
    detail:
      "Twin Scan/Analyze/Evolve/Report helps inspect and improve architecture safely. NeuroTwin stores founder profile/modes and provides strategic support summaries.",
    tip: "Tip: Use Ask Twin for “where is this file/feature” questions.",
  },
  {
    icon: "🎬",
    title: "VisionForge Creator Engine",
    subtitle: "Create images, videos, subtitles, and thumbnails.",
    detail:
      "Use Create Media to queue AI creator jobs: image generation/editing, text-to-video, script-to-video, caption generation, and background removal with job progress + history.",
    tip: "Tip: Watch render status and download generated artifacts from job output.",
  },
  {
    icon: "🧪",
    title: "Training Studio",
    subtitle: "Ingest and curate training inputs.",
    detail:
      "Upload text/files/URLs and build training datasets with filters and options. Use feedback and exports to improve quality over time.",
    tip: "Tip: Keep datasets clean with dedupe + tagging for better model iterations.",
  },
  {
    icon: "💳",
    title: "Billing, Rewards, and Integrations",
    subtitle: "Monetization and external app connection.",
    detail:
      "Manage plans, payment profiles, rewards wallets, crypto reward policies, API keys, and integration app credentials from dashboard controls.",
    tip: "Tip: Create keys per app/environment and rotate regularly.",
  },
  {
    icon: "🏢",
    title: "Enterprise Governance",
    subtitle: "Department usage, audit, and SSO.",
    detail:
      "Control team roles, token budgets per department, compliance exports, and SSO settings for enterprise-ready governance.",
    tip: "Tip: Review usage and audit exports weekly for governance hygiene.",
  },
  {
    icon: "⚙️",
    title: "Settings and Profile",
    subtitle: "Personal controls and account preferences.",
    detail:
      "Use profile and settings to manage identity, theme, notifications, and experience controls. Theme supports system/light/dark modes.",
    tip: "Tip: Keep system mode default and switch only when needed.",
  },
  {
    icon: "📊",
    title: "Operational Awareness",
    subtitle: "Track service health and key events.",
    detail:
      "Monitor status chips, logs, audits, approvals, and runtime summaries to keep NeuroEdge stable and accountable.",
    tip: "Tip: For incidents, enable safe mode first, then run diagnosis and rollback if required.",
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
