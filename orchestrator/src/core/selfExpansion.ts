import fs from "fs";
import path from "path";
import { appendEvent, readState } from "@storage/hybrid_db";
import { validateDoctrine } from "@security/doctrineShield";

export interface ExpansionOverview {
  root: string;
  backendFiles: number;
  frontendFiles: number;
  databaseArtifacts: string[];
  notableDirectories: string[];
}

export interface ExpansionProposal {
  targetVersion: string;
  summary: string;
  improvements: string[];
  migrations: string[];
  generatedModules: Array<{
    name: string;
    purpose: string;
    path: string;
    language: string;
  }>;
  requiresHumanApproval: true;
}

function walkFiles(root: string, maxDepth = 4): string[] {
  const output: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > maxDepth) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", ".venv", "venv"].includes(entry.name)) continue;
        stack.push({ dir: full, depth: current.depth + 1 });
      } else if (entry.isFile()) {
        output.push(full);
      }
    }
  }
  return output;
}

function rel(root: string, absPath: string): string {
  return path.relative(root, absPath).replace(/\\/g, "/");
}

function findDatabaseArtifacts(files: string[], root: string): string[] {
  return files
    .map((f) => rel(root, f))
    .filter((f) =>
      /(schema\.prisma|migrations|\.sql$|hybrid_db|dataset|neuroedge_state\.json|neuroedge_events\.jsonl)/i.test(
        f
      )
    )
    .slice(0, 30);
}

function inferNextVersion(current: string): string {
  const m = current.match(/v?(\d+)(?:\.(\d+))?/i);
  if (!m) return "2.0";
  const major = Number(m[1] || "1");
  return `${major + 1}.0`;
}

export function analyzeWorkspace(workspaceRoot: string): ExpansionOverview {
  const files = walkFiles(workspaceRoot);
  const backendFiles = files.filter((f) => /\/(kernel|orchestrator)\//.test(f)).length;
  const frontendFiles = files.filter((f) => /\/frontend\//.test(f)).length;
  const databaseArtifacts = findDatabaseArtifacts(files, workspaceRoot);
  const notableDirectories = ["kernel", "orchestrator", "frontend", "ml"]
    .map((d) => path.join(workspaceRoot, d))
    .filter((d) => fs.existsSync(d))
    .map((d) => rel(workspaceRoot, d));

  return {
    root: workspaceRoot,
    backendFiles,
    frontendFiles,
    databaseArtifacts,
    notableDirectories,
  };
}

export function buildExpansionProposal(workspaceRoot: string, goal: string): ExpansionProposal {
  const state = readState();
  const currentVersion = String(state.version || "v1");
  const targetVersion = inferNextVersion(currentVersion);
  const summary = `NeuroEdge expansion plan from ${currentVersion} to v${targetVersion} for goal: ${goal || "platform hardening"}.`;
  const improvements = [
    "Extract explicit domain boundaries: API gateway, planner, executor, memory, safety.",
    "Promote doctrine checks to pre-route + pre-tool execution hooks.",
    "Add integration tests for auth + scope + doctrine rejection paths.",
    "Split frontend heavy bundle into lazy-loaded route chunks.",
  ];
  const migrations = [
    "Add doctrine rules migration file and version history.",
    "Add admin snapshots for usage/metrics/version to support panel boot.",
    "Add durable conversation index for cross-device chat restore.",
  ];
  const generatedModules = [
    {
      name: "expansion_planner",
      purpose: "Generate reviewed upgrade plans from architecture state.",
      path: "orchestrator/src/generated/expansion_planner.ts",
      language: "ts",
    },
    {
      name: "doctrine_policy_pack",
      purpose: "Versioned rule packs for prompt/sql/expansion protections.",
      path: "orchestrator/src/generated/doctrine_policy_pack.ts",
      language: "ts",
    },
  ];
  return {
    targetVersion: `v${targetVersion}`,
    summary,
    improvements,
    migrations,
    generatedModules,
    requiresHumanApproval: true,
  };
}

export function previewModule(name: string, purpose: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "generated_module";
  return [
    `// Auto-generated preview module: ${safeName}`,
    `// Purpose: ${purpose}`,
    "",
    "export interface GeneratedModuleHealth {",
    "  name: string;",
    "  status: \"ready\" | \"degraded\";",
    "  checkedAt: number;",
    "}",
    "",
    `export function ${safeName}Health(): GeneratedModuleHealth {`,
    "  return {",
    `    name: \"${safeName}\",`,
    "    status: \"ready\",",
    "    checkedAt: Date.now(),",
    "  };",
    "}",
    "",
  ].join("\n");
}

function ensureAllowedFileType(filePath: string) {
  const allowed = [".ts", ".tsx", ".js", ".md", ".json", ".sh"];
  const ext = path.extname(filePath).toLowerCase();
  if (!allowed.includes(ext)) {
    throw new Error(`File type not allowed: ${ext}`);
  }
}

export function generateModuleWithConfirmation(input: {
  workspaceRoot: string;
  name: string;
  purpose: string;
  relativePath: string;
  confirm: boolean;
}) {
  const doctrine = validateDoctrine(input);
  if (!doctrine.ok) {
    return {
      ok: false as const,
      error: doctrine.reason || "Rejected by doctrine shield",
      ruleId: doctrine.ruleId,
      confirmationRequired: true,
    };
  }

  const fullPath = path.join(input.workspaceRoot, input.relativePath);
  ensureAllowedFileType(fullPath);
  const content = previewModule(input.name, input.purpose);

  const allowWrite = String(process.env.SELF_EXPANSION_ALLOW_WRITE || "false").toLowerCase() === "true";
  if (!input.confirm || !allowWrite) {
    return {
      ok: true as const,
      confirmationRequired: true,
      wroteFile: false,
      path: input.relativePath,
      preview: content,
      reason: "Set confirm=true and SELF_EXPANSION_ALLOW_WRITE=true to write generated modules.",
    };
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  appendEvent({
    type: "self_expansion.module_generated",
    timestamp: Date.now(),
    payload: {
      name: input.name,
      path: input.relativePath,
      actor: "admin",
      purpose: input.purpose,
    },
  });

  return {
    ok: true as const,
    confirmationRequired: false,
    wroteFile: true,
    path: input.relativePath,
  };
}
