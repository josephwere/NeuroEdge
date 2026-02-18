import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { appendEvent, listEvents, readState, writeState } from "@storage/hybrid_db";
import { validateDoctrine } from "@security/doctrineShield";
const execAsync = promisify(exec);

export type ExpansionSeverity = "low" | "medium" | "high" | "critical";
export type ExpansionStatus =
  | "blocked"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "merged";

export interface ExpansionSubmission {
  id: string;
  title: string;
  featureText: string;
  codeText: string;
  metadata: {
    source: "dashboard";
    uploadedBy: string;
    uploadedAt: number;
    uploadedByRole: string;
    orgId: string;
    workspaceId: string;
  };
  scan: {
    severity: ExpansionSeverity;
    signals: string[];
    doctrineOk: boolean;
    doctrineReason?: string;
  };
  status: ExpansionStatus;
  review?: {
    decisionBy: string;
    decisionRole: string;
    decisionAt: number;
    decision: "approve" | "reject";
    reason?: string;
  };
  merge?: {
    mergedBy: string;
    mergedAt: number;
    targetPath: string;
    testsRequested: boolean;
  };
}

export interface ExpansionAutoProposal {
  id: string;
  createdAt: number;
  placeholdersDetected: number;
  candidateModules: string[];
  rationale: string[];
  status: "pending_approval" | "approved" | "rejected";
}

export interface NeuroExpansionState {
  settings: {
    enabled: boolean;
    autoDailyScan: boolean;
    requireFounderApproval: boolean;
    autoTestOnMerge: boolean;
    placeholderScanRoots: string[];
    maxFindings: number;
    lastDailyRunAt: number;
  };
  submissions: ExpansionSubmission[];
  autoProposals: ExpansionAutoProposal[];
}

interface NeuroExpansionNotification {
  id: string;
  title: string;
  message: string;
  targetRoles: Array<"founder" | "admin">;
  createdAt: number;
  relatedId?: string;
}

const SIGNALS: Array<{ re: RegExp; signal: string; severity: ExpansionSeverity }> = [
  { re: /rm\s+-rf\s+\//i, signal: "Destructive filesystem command", severity: "critical" },
  { re: /curl\s+.*\|\s*sh/i, signal: "Remote script pipe execution", severity: "high" },
  { re: /powershell.*downloadstring/i, signal: "Suspicious PowerShell downloader", severity: "high" },
  { re: /drop\s+table|truncate\s+table/i, signal: "Potential destructive SQL statement", severity: "high" },
  { re: /keylogger|ransomware|steal credentials|data exfiltration/i, signal: "Malicious payload intent", severity: "critical" },
  { re: /prompt injection|ignore previous|disable safety/i, signal: "Prompt injection signature", severity: "high" },
  { re: /token\s*=\s*['"][A-Za-z0-9\-_]{20,}/i, signal: "Possible secret hardcoded", severity: "medium" },
];

const SEVERITY_ORDER: Record<ExpansionSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function ensureDefaults(): NeuroExpansionState {
  const state = readState();
  const dashboard = (state.summary?.dashboard || {}) as Record<string, any>;
  const current = (dashboard.neuroExpansion || {}) as Partial<NeuroExpansionState>;
  const next: NeuroExpansionState = {
    settings: {
      enabled: Boolean(current.settings?.enabled ?? true),
      autoDailyScan: Boolean(current.settings?.autoDailyScan ?? true),
      requireFounderApproval: Boolean(current.settings?.requireFounderApproval ?? true),
      autoTestOnMerge: Boolean(current.settings?.autoTestOnMerge ?? true),
      placeholderScanRoots: Array.isArray(current.settings?.placeholderScanRoots) && current.settings?.placeholderScanRoots.length > 0
        ? current.settings!.placeholderScanRoots.map((x) => String(x))
        : ["src", "../frontend/src", "../ml"],
      maxFindings: Math.max(50, Number(current.settings?.maxFindings || 500)),
      lastDailyRunAt: Number(current.settings?.lastDailyRunAt || 0),
    },
    submissions: Array.isArray(current.submissions) ? current.submissions : [],
    autoProposals: Array.isArray(current.autoProposals) ? current.autoProposals : [],
  };
  const shouldWrite =
    !dashboard.neuroExpansion ||
    !current.settings ||
    !Array.isArray(current.submissions) ||
    !Array.isArray(current.autoProposals);
  if (shouldWrite) {
    writeState({
      summary: {
        ...(state.summary || {}),
        dashboard: {
          ...dashboard,
          neuroExpansion: next,
        },
      },
    });
  }
  return next;
}

function save(next: NeuroExpansionState) {
  const state = readState();
  const dashboard = (state.summary?.dashboard || {}) as Record<string, any>;
  writeState({
    summary: {
      ...(state.summary || {}),
      dashboard: {
        ...dashboard,
        neuroExpansion: next,
      },
    },
  });
}

function appendFanoutNotification(notification: Omit<NeuroExpansionNotification, "id" | "createdAt">) {
  const state = readState();
  const dashboard = (state.summary?.dashboard || {}) as Record<string, any>;
  const current = Array.isArray(dashboard.neuroExpansionNotifications)
    ? dashboard.neuroExpansionNotifications
    : [];
  const entry: NeuroExpansionNotification = {
    id: `nxn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...notification,
  };
  writeState({
    summary: {
      ...(state.summary || {}),
      dashboard: {
        ...dashboard,
        neuroExpansionNotifications: [entry, ...current].slice(0, 500),
      },
    },
  });
  appendEvent({
    type: "neuroexpansion.notification.fanout",
    timestamp: Date.now(),
    payload: entry,
  });
}

export function getNeuroExpansionState(): NeuroExpansionState {
  return ensureDefaults();
}

export function saveNeuroExpansionSettings(patch: Partial<NeuroExpansionState["settings"]>) {
  const current = ensureDefaults();
  const next: NeuroExpansionState = {
    ...current,
    settings: {
      ...current.settings,
      ...patch,
      placeholderScanRoots: Array.isArray(patch.placeholderScanRoots) && patch.placeholderScanRoots.length > 0
        ? patch.placeholderScanRoots.map((x) => String(x))
        : current.settings.placeholderScanRoots,
      maxFindings: Math.max(50, Number(patch.maxFindings || current.settings.maxFindings)),
    },
  };
  save(next);
  return next.settings;
}

function scanSubmissionContent(text: string): { severity: ExpansionSeverity; signals: string[] } {
  let severity: ExpansionSeverity = "low";
  const signals: string[] = [];
  const payload = String(text || "");
  for (const check of SIGNALS) {
    if (check.re.test(payload)) {
      signals.push(check.signal);
      if (SEVERITY_ORDER[check.severity] > SEVERITY_ORDER[severity]) {
        severity = check.severity;
      }
    }
  }
  return { severity, signals };
}

export function submitNeuroExpansion(input: {
  title: string;
  featureText: string;
  codeText?: string;
  actor: string;
  role: string;
  orgId: string;
  workspaceId: string;
}) {
  const current = ensureDefaults();
  const title = String(input.title || "").trim();
  const featureText = String(input.featureText || "").trim();
  const codeText = String(input.codeText || "");
  if (!title || !featureText) {
    return { ok: false as const, error: "title and featureText are required" };
  }

  const scan = scanSubmissionContent(`${title}\n${featureText}\n${codeText}`);
  const doctrine = validateDoctrine({ title, featureText, codeText });
  const finalSeverity = !doctrine.ok && SEVERITY_ORDER[scan.severity] < SEVERITY_ORDER.high ? "high" : scan.severity;
  const submission: ExpansionSubmission = {
    id: `nx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    featureText,
    codeText,
    metadata: {
      source: "dashboard",
      uploadedBy: input.actor || "unknown",
      uploadedAt: Date.now(),
      uploadedByRole: input.role || "unknown",
      orgId: input.orgId || "personal",
      workspaceId: input.workspaceId || "default",
    },
    scan: {
      severity: finalSeverity,
      signals: Array.from(
        new Set([...(scan.signals || []), ...(doctrine.ok ? [] : [doctrine.reason || "Doctrine rejection"])])
      ),
      doctrineOk: doctrine.ok,
      doctrineReason: doctrine.reason,
    },
    status: finalSeverity === "high" || finalSeverity === "critical" ? "blocked" : "pending_approval",
  };

  const next: NeuroExpansionState = {
    ...current,
    submissions: [submission, ...current.submissions].slice(0, 500),
  };
  save(next);
  appendEvent({
    type: "neuroexpansion.submission.created",
    timestamp: Date.now(),
    payload: {
      id: submission.id,
      title: submission.title,
      status: submission.status,
      severity: submission.scan.severity,
      actor: submission.metadata.uploadedBy,
      role: submission.metadata.uploadedByRole,
      orgId: submission.metadata.orgId,
      workspaceId: submission.metadata.workspaceId,
    },
  });
  appendFanoutNotification({
    title: "NeuroExpansion submission received",
    message: `${submission.title} by ${submission.metadata.uploadedByRole}/${submission.metadata.uploadedBy}`,
    targetRoles: ["founder", "admin"],
    relatedId: submission.id,
  });
  return { ok: true as const, submission };
}

export function reviewNeuroExpansionSubmission(input: {
  id: string;
  decision: "approve" | "reject";
  reason?: string;
  actor: string;
  role: string;
}) {
  const current = ensureDefaults();
  if (
    input.decision === "approve" &&
    current.settings.requireFounderApproval &&
    String(input.role || "").toLowerCase() !== "founder"
  ) {
    return { ok: false as const, error: "Founder approval is required by policy for approval decisions" };
  }
  const submissions = [...current.submissions];
  const idx = submissions.findIndex((x) => x.id === input.id);
  if (idx < 0) return { ok: false as const, error: "submission not found" };
  const existing = submissions[idx];
  const status: ExpansionStatus = input.decision === "approve" ? "approved" : "rejected";
  submissions[idx] = {
    ...existing,
    status,
    review: {
      decisionBy: input.actor || "unknown",
      decisionRole: input.role || "unknown",
      decisionAt: Date.now(),
      decision: input.decision,
      reason: String(input.reason || "").trim(),
    },
  };
  const next = { ...current, submissions };
  save(next);
  appendEvent({
    type: "neuroexpansion.submission.reviewed",
    timestamp: Date.now(),
    payload: {
      id: input.id,
      decision: input.decision,
      actor: input.actor || "unknown",
      role: input.role || "unknown",
      reason: input.reason || "",
    },
  });
  appendFanoutNotification({
    title: "NeuroExpansion submission reviewed",
    message: `${input.id} ${input.decision} by ${input.role || "unknown"}`,
    targetRoles: ["founder", "admin"],
    relatedId: input.id,
  });
  return { ok: true as const, submission: submissions[idx] };
}

export function mergeNeuroExpansionSubmission(input: {
  id: string;
  actor: string;
  role: string;
  testsRequested: boolean;
}) {
  const current = ensureDefaults();
  const submissions = [...current.submissions];
  const idx = submissions.findIndex((x) => x.id === input.id);
  if (idx < 0) return { ok: false as const, error: "submission not found" };
  const item = submissions[idx];
  if (item.status !== "approved") {
    return { ok: false as const, error: "only approved submissions can be merged" };
  }
  const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "feature";
  const outDir = path.join(process.cwd(), "src", "generated", "neuroexpansion");
  fs.mkdirSync(outDir, { recursive: true });
  const targetPath = path.join(outDir, `${slug}_${item.id}.md`);
  const body = [
    `# NeuroExpansion Merge Artifact`,
    ``,
    `- id: ${item.id}`,
    `- title: ${item.title}`,
    `- uploaded_by: ${item.metadata.uploadedBy}`,
    `- uploaded_at: ${new Date(item.metadata.uploadedAt).toISOString()}`,
    `- approved_by: ${item.review?.decisionBy || "unknown"}`,
    `- merged_by: ${input.actor || "unknown"}`,
    `- merged_at: ${new Date().toISOString()}`,
    ``,
    `## Requested Feature`,
    item.featureText || "(none)",
    ``,
    `## Provided Code`,
    "```txt",
    item.codeText || "",
    "```",
  ].join("\n");
  fs.writeFileSync(targetPath, body, "utf-8");

  submissions[idx] = {
    ...item,
    status: "merged",
    merge: {
      mergedBy: input.actor || "unknown",
      mergedAt: Date.now(),
      targetPath: path.relative(process.cwd(), targetPath),
      testsRequested: Boolean(input.testsRequested),
    },
  };
  const next = { ...current, submissions };
  save(next);
  appendEvent({
    type: "neuroexpansion.submission.merged",
    timestamp: Date.now(),
    payload: {
      id: item.id,
      mergedBy: input.actor || "unknown",
      role: input.role || "unknown",
      targetPath: submissions[idx].merge?.targetPath || "",
      testsRequested: Boolean(input.testsRequested),
    },
  });
  appendFanoutNotification({
    title: "NeuroExpansion submission merged",
    message: `${item.id} merged by ${input.role || "unknown"}`,
    targetRoles: ["founder", "admin"],
    relatedId: item.id,
  });
  return { ok: true as const, submission: submissions[idx] };
}

function walkFiles(rootPath: string, onFile: (filePath: string) => void, limit = 2000) {
  const stack = [rootPath];
  let seen = 0;
  while (stack.length > 0 && seen < limit) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (seen >= limit) break;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "__pycache__") {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      seen += 1;
      onFile(full);
    }
  }
}

export function scanPlaceholderGaps() {
  const current = ensureDefaults();
  const roots = current.settings.placeholderScanRoots;
  const findings: Array<{ file: string; line: number; marker: string; text: string }> = [];
  const markerRe = /\b(TODO|FIXME|placeholder|mock|dummy|not implemented)\b/i;

  for (const relRoot of roots) {
    const absRoot = path.join(process.cwd(), relRoot);
    walkFiles(absRoot, (filePath) => {
      if (findings.length >= current.settings.maxFindings) return;
      const ext = path.extname(filePath).toLowerCase();
      if (![".ts", ".tsx", ".js", ".py", ".go", ".md", ".json"].includes(ext)) return;
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        return;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (findings.length >= current.settings.maxFindings) break;
        const line = lines[i];
        const match = line.match(markerRe);
        if (match) {
          findings.push({
            file: path.relative(process.cwd(), filePath),
            line: i + 1,
            marker: match[1].toLowerCase(),
            text: line.trim().slice(0, 220),
          });
        }
      }
    });
  }

  const byMarker: Record<string, number> = {};
  findings.forEach((f) => {
    byMarker[f.marker] = (byMarker[f.marker] || 0) + 1;
  });
  return {
    scannedAt: Date.now(),
    totalFindings: findings.length,
    byMarker,
    findings,
  };
}

export function runDailyNeuroExpansionPlanner() {
  const current = ensureDefaults();
  const now = Date.now();
  if (!current.settings.enabled || !current.settings.autoDailyScan) {
    return { skipped: true, reason: "disabled" as const };
  }
  if (current.settings.lastDailyRunAt > 0 && now - current.settings.lastDailyRunAt < 24 * 3600 * 1000) {
    return { skipped: true, reason: "already_ran_recently" as const };
  }

  const scan = scanPlaceholderGaps();
  const recentDownvotes = listEvents(5000).filter(
    (e) => e.type === "quality.model.outcome" && String(e.payload?.rating || "") === "down"
  ).length;
  const proposal: ExpansionAutoProposal = {
    id: `nx-auto-${now}`,
    createdAt: now,
    placeholdersDetected: scan.totalFindings,
    candidateModules: [
      "verified_answer_strict_mode",
      "retrieval_freshness_watcher",
      "assistant_quality_autotuner",
    ],
    rationale: [
      `Placeholder findings: ${scan.totalFindings}`,
      `Recent negative feedback events: ${recentDownvotes}`,
      "Generated from daily NeuroExpansion planner",
    ],
    status: "pending_approval",
  };

  const next: NeuroExpansionState = {
    ...current,
    settings: {
      ...current.settings,
      lastDailyRunAt: now,
    },
    autoProposals: [proposal, ...current.autoProposals].slice(0, 120),
  };
  save(next);
  appendEvent({
    type: "neuroexpansion.daily.proposal",
    timestamp: now,
    payload: proposal,
  });
  appendFanoutNotification({
    title: "NeuroExpansion daily proposal",
    message: `Auto proposal ${proposal.id} created (${proposal.placeholdersDetected} placeholder findings)`,
    targetRoles: ["founder", "admin"],
    relatedId: proposal.id,
  });
  return { skipped: false, proposal, scan };
}

function sanitizeBranchToken(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 80) || "neuroexpansion";
}

function tempPatchPath(id: string) {
  const dir = path.join(process.cwd(), "data", "neuroexpansion");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${id}.patch`);
}

async function gitRun(cmd: string) {
  return execAsync(cmd, { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 });
}

async function createCheckpoint(label: string) {
  const snapshotDir = path.join(process.cwd(), "snapshots", "neuroexpansion");
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
  const branch = (await gitRun("git rev-parse --abbrev-ref HEAD")).stdout.trim();
  const head = (await gitRun("git rev-parse HEAD")).stdout.trim();
  const status = (await gitRun("git status --porcelain")).stdout;
  const checkpoint = {
    id: `nxcp-${Date.now()}`,
    label,
    branch,
    head,
    status,
    createdAt: Date.now(),
    restoreHint: `git checkout ${branch} && git reset --hard ${head}`,
  };
  const file = path.join(snapshotDir, `${checkpoint.id}.json`);
  fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2), "utf-8");
  return { ...checkpoint, file: path.relative(process.cwd(), file) };
}

export async function previewSubmissionPatch(id: string) {
  const current = ensureDefaults();
  const submission = current.submissions.find((s) => s.id === id);
  if (!submission) return { ok: false as const, error: "submission not found" };
  const patchText = String(submission.codeText || "").trim();
  if (!patchText) return { ok: false as const, error: "submission has no patch code text" };
  const patchPath = tempPatchPath(id);
  fs.writeFileSync(patchPath, patchText, "utf-8");
  try {
    const check = await gitRun(`git apply --check "${patchPath}"`);
    const stat = await gitRun(`git apply --stat "${patchPath}"`);
    const numstat = await gitRun(`git apply --numstat "${patchPath}"`);
    return {
      ok: true as const,
      preview: {
        patchPath: path.relative(process.cwd(), patchPath),
        checkStdout: check.stdout,
        stat: stat.stdout,
        numstat: numstat.stdout,
      },
    };
  } catch (err: any) {
    return {
      ok: false as const,
      error: err?.stderr || err?.message || String(err),
      patchPath: path.relative(process.cwd(), patchPath),
    };
  }
}

export async function applySubmissionPatch(input: {
  id: string;
  actor: string;
  role: string;
  runTests: boolean;
  testCommand?: string;
}) {
  const current = ensureDefaults();
  const submission = current.submissions.find((s) => s.id === input.id);
  if (!submission) return { ok: false as const, error: "submission not found" };
  if (submission.status !== "approved" && submission.status !== "merged") {
    return { ok: false as const, error: "submission must be approved first" };
  }
  const patchText = String(submission.codeText || "").trim();
  if (!patchText) return { ok: false as const, error: "submission has no patch code text" };
  const preview = await previewSubmissionPatch(input.id);
  if (!preview.ok) return preview;

  const patchPath = tempPatchPath(input.id);
  const checkpoint = await createCheckpoint(`before-apply-${input.id}`);
  try {
    await gitRun(`git apply --index "${patchPath}"`);
  } catch (err: any) {
    return { ok: false as const, error: err?.stderr || err?.message || String(err), checkpoint };
  }

  let testResult: { ok: boolean; command: string; stdout?: string; stderr?: string } | null = null;
  if (input.runTests) {
    const cmd = String(input.testCommand || "pnpm run typecheck").trim();
    try {
      const out = await execAsync(cmd, { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 });
      testResult = { ok: true, command: cmd, stdout: out.stdout, stderr: out.stderr };
    } catch (err: any) {
      testResult = {
        ok: false,
        command: cmd,
        stdout: err?.stdout || "",
        stderr: err?.stderr || err?.message || String(err),
      };
    }
  }

  appendEvent({
    type: "neuroexpansion.patch.applied",
    timestamp: Date.now(),
    payload: {
      id: input.id,
      actor: input.actor,
      role: input.role,
      checkpointId: checkpoint.id,
      tests: testResult,
    },
  });
  appendFanoutNotification({
    title: "NeuroExpansion patch applied",
    message: `${input.id} applied by ${input.role || "unknown"}${testResult ? ` (tests: ${testResult.ok ? "pass" : "fail"})` : ""}`,
    targetRoles: ["founder", "admin"],
    relatedId: input.id,
  });
  return { ok: true as const, checkpoint, testResult };
}

export async function generateSubmissionPrDraft(input: {
  id: string;
  actor: string;
  role: string;
  baseBranch?: string;
  materializeBranch?: boolean;
  push?: boolean;
  remote?: string;
}) {
  const current = ensureDefaults();
  const submission = current.submissions.find((s) => s.id === input.id);
  if (!submission) return { ok: false as const, error: "submission not found" };
  if (submission.status !== "approved" && submission.status !== "merged") {
    return { ok: false as const, error: "submission must be approved before PR generation" };
  }
  const baseBranch = sanitizeBranchToken(input.baseBranch || "main");
  const branchName = sanitizeBranchToken(`neuroexpansion/${submission.id}`);
  const title = `NeuroExpansion: ${submission.title}`;
  const body = [
    `## NeuroExpansion Proposal`,
    ``,
    `- Submission ID: ${submission.id}`,
    `- Uploaded by: ${submission.metadata.uploadedByRole}/${submission.metadata.uploadedBy}`,
    `- Approved by: ${submission.review?.decisionBy || "n/a"}`,
    ``,
    `### Feature`,
    submission.featureText,
    ``,
    `### Security Scan`,
    `- Severity: ${submission.scan.severity}`,
    `- Doctrine: ${submission.scan.doctrineOk ? "pass" : "fail"}`,
    `- Signals: ${(submission.scan.signals || []).join(", ") || "none"}`,
    ``,
    `### Notes`,
    `Generated by NeuroExpansion PR workflow.`,
  ].join("\n");

  let materialized = false;
  let pushResult: { ok: boolean; stdout?: string; stderr?: string } | null = null;
  if (input.materializeBranch) {
    await gitRun(`git checkout -B "${branchName}"`);
    await gitRun("git add -A");
    await gitRun(`git commit -m "feat(neuroexpansion): ${submission.id}" --allow-empty`);
    materialized = true;
    if (input.push) {
      const remote = sanitizeBranchToken(input.remote || "origin");
      try {
        const out = await gitRun(`git push "${remote}" "${branchName}"`);
        pushResult = { ok: true, stdout: out.stdout, stderr: out.stderr };
      } catch (err: any) {
        pushResult = { ok: false, stdout: err?.stdout || "", stderr: err?.stderr || err?.message || String(err) };
      }
    }
  }

  const cliHint = `gh pr create --base ${baseBranch} --head ${branchName} --title "${title.replace(/"/g, "'")}" --body-file ./tmp_pr_body_${submission.id}.md`;
  appendEvent({
    type: "neuroexpansion.pr.generated",
    timestamp: Date.now(),
    payload: {
      id: submission.id,
      actor: input.actor,
      role: input.role,
      branchName,
      baseBranch,
      materialized,
      pushed: Boolean(pushResult?.ok),
    },
  });
  appendFanoutNotification({
    title: "NeuroExpansion PR draft generated",
    message: `${submission.id} PR draft ready on ${branchName}`,
    targetRoles: ["founder", "admin"],
    relatedId: submission.id,
  });
  return {
    ok: true as const,
    pr: {
      id: `nxpr-${Date.now()}`,
      submissionId: submission.id,
      baseBranch,
      branchName,
      title,
      body,
      materialized,
      pushResult,
      cliHint,
      createdAt: Date.now(),
    },
  };
}
