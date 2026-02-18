import { readState, writeState } from "@storage/hybrid_db";

export type FrontierStatus = "planned" | "in_progress" | "blocked" | "done";
export type FrontierPriority = "critical" | "high" | "medium" | "low";

export interface FrontierItem {
  id: string;
  group: string;
  title: string;
  description: string;
  status: FrontierStatus;
  priority: FrontierPriority;
  owner: string;
  targetQuarter: string;
  notes: string;
  updatedAt: number;
}

export interface FrontierMilestone {
  id: string;
  name: string;
  quarter: string;
  owner: string;
  status: FrontierStatus;
  successCriteria: string[];
  updatedAt: number;
}

export interface FrontierProgramState {
  version: string;
  updatedAt: number;
  items: FrontierItem[];
  milestones: FrontierMilestone[];
}

function now() {
  return Date.now();
}

function mkItem(
  id: string,
  group: string,
  title: string,
  description: string,
  priority: FrontierPriority,
  targetQuarter: string
): FrontierItem {
  return {
    id,
    group,
    title,
    description,
    status: "planned",
    priority,
    owner: "unassigned",
    targetQuarter,
    notes: "",
    updatedAt: now(),
  };
}

function defaultItems(): FrontierItem[] {
  return [
    mkItem("model_core_01", "Model core capability", "Frontier base model quality", "Reasoning/coding/research multilingual quality parity.", "critical", "Q2-2026"),
    mkItem("model_core_02", "Model core capability", "Long-context robustness", "100k+ context quality retention and retrieval fidelity.", "critical", "Q2-2026"),
    mkItem("model_core_03", "Model core capability", "Tool-use planning depth", "Reliable multi-step planning under ambiguity.", "high", "Q2-2026"),
    mkItem("model_core_04", "Model core capability", "Grounded generation", "Lower hallucination with stronger grounding guarantees.", "critical", "Q2-2026"),
    mkItem("model_core_05", "Model core capability", "Multimodal parity", "Image/audio/video understanding + generation parity.", "high", "Q3-2026"),

    mkItem("training_01", "Training + data engine", "Curated instruction corpus", "Large high-quality labeled corpus pipeline.", "critical", "Q2-2026"),
    mkItem("training_02", "Training + data engine", "Preference tuning", "DPO/RLHF-style preference optimization loop.", "critical", "Q2-2026"),
    mkItem("training_03", "Training + data engine", "Domain packs at scale", "Medical/legal/finance packs with legal-safe sources.", "high", "Q3-2026"),
    mkItem("training_04", "Training + data engine", "Continual training infra", "Daily/weekly training cycles + rollbackable model registry.", "critical", "Q2-2026"),
    mkItem("training_05", "Training + data engine", "Data lineage & provenance", "Traceability, dedup, contamination prevention.", "high", "Q2-2026"),

    mkItem("eval_01", "Evaluation system", "Massive eval bank", "Thousands of tasks per domain with versioned suites.", "critical", "Q2-2026"),
    mkItem("eval_02", "Evaluation system", "Adversarial evals", "Prompt injection/jailbreak/tool abuse stress suites.", "critical", "Q2-2026"),
    mkItem("eval_03", "Evaluation system", "Regression CI gates", "Block deploys on quality regression thresholds.", "critical", "Q2-2026"),
    mkItem("eval_04", "Evaluation system", "A/B + canary promotion", "Cross-model promotion based on objective wins.", "high", "Q2-2026"),
    mkItem("eval_05", "Evaluation system", "Human eval workflows", "Rubric-driven review and adjudication pipelines.", "high", "Q3-2026"),

    mkItem("sre_01", "Reliability + SRE", "Multi-region failover", "Automated regional failover and recovery drills.", "high", "Q3-2026"),
    mkItem("sre_02", "Reliability + SRE", "Queueing/backpressure", "Bounded queues + load shedding across critical paths.", "critical", "Q2-2026"),
    mkItem("sre_03", "Reliability + SRE", "Autoscaling policies", "Latency/error-budget driven autoscaling.", "high", "Q3-2026"),
    mkItem("sre_04", "Reliability + SRE", "DR runbooks", "Tested disaster recovery with documented RTO/RPO.", "high", "Q3-2026"),
    mkItem("sre_05", "Reliability + SRE", "SLO/error budget enforcement", "Release gating tied to SLO compliance.", "critical", "Q2-2026"),

    mkItem("perf_01", "Latency + performance", "First-token latency", "Optimize streaming startup and decode path.", "high", "Q2-2026"),
    mkItem("perf_02", "Latency + performance", "Caching hierarchy", "Retrieval/tool/response caches with invalidation policy.", "high", "Q2-2026"),
    mkItem("perf_03", "Latency + performance", "Batching/scheduling", "Inference workload schedulers for throughput.", "high", "Q3-2026"),
    mkItem("perf_04", "Latency + performance", "GPU/CPU placement", "Placement optimization and capacity packs.", "medium", "Q3-2026"),
    mkItem("perf_05", "Latency + performance", "Cost-aware routing", "Route by cost+quality objectives.", "high", "Q2-2026"),

    mkItem("retrieval_01", "Retrieval quality", "Advanced chunking/indexing", "Semantic chunking at large-scale corpora.", "high", "Q2-2026"),
    mkItem("retrieval_02", "Retrieval quality", "Freshness SLAs", "Recrawl cadence and freshness contracts.", "high", "Q2-2026"),
    mkItem("retrieval_03", "Retrieval quality", "Source trust controls", "Domain trust scoring and policy enforcement.", "critical", "Q2-2026"),
    mkItem("retrieval_04", "Retrieval quality", "Citation verification", "Link-health and source validity checks.", "high", "Q2-2026"),
    mkItem("retrieval_05", "Retrieval quality", "Retrieval observability", "Diagnose low-quality/missed retrieval cases.", "high", "Q2-2026"),

    mkItem("trust_01", "Trust + safety", "Fine-grained policy engine", "Contextual policy with action-level controls.", "critical", "Q2-2026"),
    mkItem("trust_02", "Trust + safety", "Formal red-team program", "Continuous offensive testing + tracked fixes.", "high", "Q2-2026"),
    mkItem("trust_03", "Trust + safety", "Runtime abuse/fraud detection", "User/key/org anomaly controls.", "critical", "Q2-2026"),
    mkItem("trust_04", "Trust + safety", "High-risk guardrails", "Medical/legal/financial stricter constraints.", "critical", "Q2-2026"),
    mkItem("trust_05", "Trust + safety", "User uncertainty disclosure", "Transparent confidence/risk disclosures.", "high", "Q2-2026"),

    mkItem("sec_01", "Security + compliance", "SOC2/ISO readiness", "Control evidence and audit trails.", "high", "Q3-2026"),
    mkItem("sec_02", "Security + compliance", "Key lifecycle + rotation", "KMS/HSM integration and rotation workflows.", "critical", "Q2-2026"),
    mkItem("sec_03", "Security + compliance", "Secret management hardening", "No secret leakage and strict secret ops.", "critical", "Q2-2026"),
    mkItem("sec_04", "Security + compliance", "Tenant isolation", "Hard org boundary enforcement end-to-end.", "critical", "Q2-2026"),
    mkItem("sec_05", "Security + compliance", "Compliance retention/export", "Jurisdiction-ready retention policies.", "high", "Q3-2026"),

    mkItem("product_01", "Product quality", "Session memory controls", "User-controllable memory with predictable behavior.", "high", "Q2-2026"),
    mkItem("product_02", "Product quality", "UX consistency", "Role/page consistency and quality bar.", "high", "Q2-2026"),
    mkItem("product_03", "Product quality", "Explainability UX", "Trace/explain controls for power users.", "medium", "Q3-2026"),
    mkItem("product_04", "Product quality", "Mobile + desktop parity", "Reliable multi-platform parity.", "high", "Q2-2026"),
    mkItem("product_05", "Product quality", "Accessibility + localization", "A11y and multilingual UX completeness.", "high", "Q3-2026"),

    mkItem("devplat_01", "Developer platform", "Versioned public API", "Stable contracts and compatibility policy.", "critical", "Q2-2026"),
    mkItem("devplat_02", "Developer platform", "SDK/docs quality", "Guides/examples/migrations for developers.", "high", "Q2-2026"),
    mkItem("devplat_03", "Developer platform", "API lifecycle governance", "Deprecation and changelog discipline.", "high", "Q2-2026"),
    mkItem("devplat_04", "Developer platform", "Webhook reliability/replay", "Replay protection and guaranteed delivery tooling.", "high", "Q2-2026"),
    mkItem("devplat_05", "Developer platform", "Tool sandbox guarantees", "Safe execution boundaries and policy controls.", "critical", "Q2-2026"),

    mkItem("bizops_01", "Business + operations", "Accurate metering", "Correct billing/token metering at scale.", "high", "Q2-2026"),
    mkItem("bizops_02", "Business + operations", "Support SLA tiers", "Support workflow with clear SLA queues.", "medium", "Q3-2026"),
    mkItem("bizops_03", "Business + operations", "Incident communications", "Status page + RCA lifecycle.", "high", "Q2-2026"),
    mkItem("bizops_04", "Business + operations", "Enterprise onboarding workflows", "SSO/roles/governance templates.", "high", "Q2-2026"),
    mkItem("bizops_05", "Business + operations", "Partner certification", "Integration validation and certification process.", "medium", "Q3-2026"),

    mkItem("gov_01", "Governance + org execution", "Release train", "Clear release cadence and ownership map.", "high", "Q2-2026"),
    mkItem("gov_02", "Governance + org execution", "Coverage + quality bars", "Target test coverage and enforced quality thresholds.", "critical", "Q2-2026"),
    mkItem("gov_03", "Governance + org execution", "North-star KPI dashboard", "Unified KPI board for model/product/reliability.", "high", "Q2-2026"),
    mkItem("gov_04", "Governance + org execution", "Quarterly roadmap gates", "Milestone-gated execution planning.", "high", "Q2-2026"),
    mkItem("gov_05", "Governance + org execution", "Ops readiness", "Team hiring/on-call/process scale readiness.", "medium", "Q3-2026"),
  ];
}

function defaultMilestones(): FrontierMilestone[] {
  return [
    {
      id: "ms_q2_foundation",
      name: "Q2 Foundation Gate",
      quarter: "Q2-2026",
      owner: "founder",
      status: "planned",
      successCriteria: [
        "All critical Q2 items in progress or done",
        "Nightly eval + regression checks active",
        "Load shedding and SLO checks active",
      ],
      updatedAt: now(),
    },
    {
      id: "ms_q3_scale",
      name: "Q3 Scale Gate",
      quarter: "Q3-2026",
      owner: "founder",
      status: "planned",
      successCriteria: [
        "Multi-region and DR playbooks validated",
        "Enterprise onboarding and compliance packs hardened",
        "Cross-model canary promotion active",
      ],
      updatedAt: now(),
    },
  ];
}

function defaultProgramState(): FrontierProgramState {
  return {
    version: "v1",
    updatedAt: now(),
    items: defaultItems(),
    milestones: defaultMilestones(),
  };
}

export function getFrontierProgram(): FrontierProgramState {
  const state = readState();
  const raw = state.summary?.frontierProgram as FrontierProgramState | undefined;
  if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) {
    const seeded = defaultProgramState();
    writeState({
      ...state,
      summary: {
        ...(state.summary || {}),
        frontierProgram: seeded,
      },
    });
    return seeded;
  }
  return {
    version: raw.version || "v1",
    updatedAt: Number(raw.updatedAt || now()),
    items: Array.isArray(raw.items) ? raw.items : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
  };
}

export function saveFrontierProgram(next: FrontierProgramState): FrontierProgramState {
  const state = readState();
  const merged: FrontierProgramState = {
    version: next.version || "v1",
    updatedAt: now(),
    items: Array.isArray(next.items) ? next.items : [],
    milestones: Array.isArray(next.milestones) ? next.milestones : [],
  };
  writeState({
    ...state,
    summary: {
      ...(state.summary || {}),
      frontierProgram: merged,
    },
  });
  return merged;
}

export function upsertFrontierItem(
  patch: Partial<FrontierItem> & { id: string }
): FrontierProgramState {
  const program = getFrontierProgram();
  const idx = program.items.findIndex((i) => i.id === patch.id);
  if (idx < 0) {
    const created: FrontierItem = {
      id: patch.id,
      group: String(patch.group || "Uncategorized"),
      title: String(patch.title || patch.id),
      description: String(patch.description || ""),
      status: (patch.status as FrontierStatus) || "planned",
      priority: (patch.priority as FrontierPriority) || "medium",
      owner: String(patch.owner || "unassigned"),
      targetQuarter: String(patch.targetQuarter || "Q4-2026"),
      notes: String(patch.notes || ""),
      updatedAt: now(),
    };
    return saveFrontierProgram({
      ...program,
      items: [...program.items, created],
    });
  }
  const nextItems = [...program.items];
  nextItems[idx] = {
    ...nextItems[idx],
    ...patch,
    updatedAt: now(),
  };
  return saveFrontierProgram({
    ...program,
    items: nextItems,
  });
}

export function bulkUpdateFrontierItems(params: {
  ids: string[];
  status?: FrontierStatus;
  owner?: string;
  priority?: FrontierPriority;
  notes?: string;
}): FrontierProgramState {
  const program = getFrontierProgram();
  const ids = new Set((params.ids || []).map((s) => String(s)));
  const next = program.items.map((item) => {
    if (!ids.has(item.id)) return item;
    return {
      ...item,
      status: params.status || item.status,
      owner: params.owner || item.owner,
      priority: params.priority || item.priority,
      notes: params.notes !== undefined ? String(params.notes) : item.notes,
      updatedAt: now(),
    };
  });
  return saveFrontierProgram({ ...program, items: next });
}

export function upsertFrontierMilestone(
  patch: Partial<FrontierMilestone> & { id: string }
): FrontierProgramState {
  const program = getFrontierProgram();
  const idx = program.milestones.findIndex((m) => m.id === patch.id);
  if (idx < 0) {
    const created: FrontierMilestone = {
      id: patch.id,
      name: String(patch.name || patch.id),
      quarter: String(patch.quarter || "Q4-2026"),
      owner: String(patch.owner || "unassigned"),
      status: (patch.status as FrontierStatus) || "planned",
      successCriteria: Array.isArray(patch.successCriteria)
        ? patch.successCriteria.map((s) => String(s))
        : [],
      updatedAt: now(),
    };
    return saveFrontierProgram({
      ...program,
      milestones: [...program.milestones, created],
    });
  }
  const nextMilestones = [...program.milestones];
  nextMilestones[idx] = {
    ...nextMilestones[idx],
    ...patch,
    updatedAt: now(),
  };
  return saveFrontierProgram({
    ...program,
    milestones: nextMilestones,
  });
}

export function frontierTrainingReadinessReport() {
  const program = getFrontierProgram();
  const critical = program.items.filter((i) => i.priority === "critical");
  const criticalDone = critical.filter((i) => i.status === "done").length;
  const high = program.items.filter((i) => i.priority === "high");
  const highDone = high.filter((i) => i.status === "done").length;
  const blocked = program.items.filter((i) => i.status === "blocked");

  const readinessScore =
    program.items.length === 0
      ? 0
      : Number(
          (
            program.items.reduce((acc, i) => {
              const weight =
                i.priority === "critical" ? 4 : i.priority === "high" ? 3 : i.priority === "medium" ? 2 : 1;
              const value = i.status === "done" ? 1 : i.status === "in_progress" ? 0.5 : 0;
              return acc + weight * value;
            }, 0) /
            program.items.reduce(
              (acc, i) =>
                acc +
                (i.priority === "critical" ? 4 : i.priority === "high" ? 3 : i.priority === "medium" ? 2 : 1),
              0
            )
          ).toFixed(4)
        );

  const gate = readinessScore >= 0.72 && blocked.length < 8 && criticalDone >= Math.ceil(critical.length * 0.6);
  return {
    gate,
    readinessScore,
    totals: {
      items: program.items.length,
      done: program.items.filter((i) => i.status === "done").length,
      inProgress: program.items.filter((i) => i.status === "in_progress").length,
      planned: program.items.filter((i) => i.status === "planned").length,
      blocked: blocked.length,
      criticalDone,
      criticalTotal: critical.length,
      highDone,
      highTotal: high.length,
    },
    topBlocked: blocked.slice(0, 20),
    recommendation: gate
      ? "Training bootstrap can proceed with guarded rollout."
      : "Do not start full-scale training yet. Clear blocked critical items first.",
  };
}

export function resetFrontierProgram(): FrontierProgramState {
  return saveFrontierProgram(defaultProgramState());
}
