import fs from "fs";
import path from "path";
import { Request, Response, NextFunction } from "express";
import { appendEvent } from "@storage/hybrid_db";

export interface DoctrineRule {
  id: string;
  version: number;
  enabled: boolean;
  category: "prompt_injection" | "sql_injection" | "expansion_guard" | "input_validation";
  action: "reject" | "warn";
  pattern: string;
  message: string;
}

interface DoctrineFile {
  version: number;
  updatedAt: number;
  rules: DoctrineRule[];
}

const doctrineFilePath = path.join(process.cwd(), "data", "doctrine_rules.json");

function defaultRules(): DoctrineRule[] {
  return [
    {
      id: "prompt-injection-ignore-rules",
      version: 1,
      enabled: true,
      category: "prompt_injection",
      action: "reject",
      pattern: "(ignore previous instructions|override system prompt|reveal secret|bypass safety)",
      message: "Prompt-injection pattern detected.",
    },
    {
      id: "sql-union-select",
      version: 1,
      enabled: true,
      category: "sql_injection",
      action: "reject",
      pattern: "((union\\s+select)|(drop\\s+table)|(or\\s+1=1)|(information_schema))",
      message: "SQL-injection pattern detected.",
    },
    {
      id: "expansion-no-self-deploy",
      version: 1,
      enabled: true,
      category: "expansion_guard",
      action: "reject",
      pattern: "(self deploy|auto deploy|deploy without approval|silent rewrite)",
      message: "Unsafe expansion instruction detected.",
    },
    {
      id: "input-binary-control",
      version: 1,
      enabled: true,
      category: "input_validation",
      action: "reject",
      pattern: "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]",
      message: "Control characters are not allowed in request text.",
    },
  ];
}

function ensureDoctrineFile(): DoctrineFile {
  const dataDir = path.dirname(doctrineFilePath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(doctrineFilePath)) {
    const initial: DoctrineFile = {
      version: 1,
      updatedAt: Date.now(),
      rules: defaultRules(),
    };
    fs.writeFileSync(doctrineFilePath, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
  const raw = fs.readFileSync(doctrineFilePath, "utf-8");
  try {
    const parsed = JSON.parse(raw) as DoctrineFile;
    if (!Array.isArray(parsed.rules)) throw new Error("invalid");
    return parsed;
  } catch {
    const fallback: DoctrineFile = {
      version: 1,
      updatedAt: Date.now(),
      rules: defaultRules(),
    };
    fs.writeFileSync(doctrineFilePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

export function listDoctrineRules(): DoctrineRule[] {
  return ensureDoctrineFile().rules;
}

export function upsertDoctrineRule(input: DoctrineRule): DoctrineRule {
  const current = ensureDoctrineFile();
  const nextRules = current.rules.filter((r) => r.id !== input.id);
  nextRules.push(input);
  const next: DoctrineFile = {
    version: Math.max(1, current.version + 1),
    updatedAt: Date.now(),
    rules: nextRules,
  };
  fs.writeFileSync(doctrineFilePath, JSON.stringify(next, null, 2), "utf-8");
  appendEvent({
    type: "doctrine.rule.upsert",
    timestamp: Date.now(),
    payload: { id: input.id, category: input.category, version: input.version },
  });
  return input;
}

export function doctrineVersion(): number {
  return ensureDoctrineFile().version;
}

function collectStrings(value: unknown, out: string[]) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out);
    }
  }
}

export function validateDoctrine(payload: unknown): { ok: boolean; reason?: string; ruleId?: string } {
  const rules = listDoctrineRules().filter((r) => r.enabled);
  const texts: string[] = [];
  collectStrings(payload, texts);
  const blob = texts.join("\n").toLowerCase();
  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern, "i");
      if (!re.test(blob)) continue;
      if (rule.action === "warn") {
        appendEvent({
          type: "doctrine.warning",
          timestamp: Date.now(),
          payload: { ruleId: rule.id, category: rule.category, message: rule.message },
        });
        continue;
      }
      return { ok: false, reason: rule.message, ruleId: rule.id };
    } catch {
      // ignore invalid regex at runtime
    }
  }
  return { ok: true };
}

export function doctrineShieldMiddleware(req: Request, res: Response, next: NextFunction) {
  const enforce = String(process.env.DOCTRINE_ENFORCE || "true").toLowerCase() === "true";
  if (!enforce) return next();
  if (req.method === "GET") return next();

  const result = validateDoctrine(req.body || {});
  if (!result.ok) {
    appendEvent({
      type: "doctrine.rejected",
      timestamp: Date.now(),
      payload: {
        path: req.path,
        method: req.method,
        actor: req.auth?.sub || "unknown",
        orgId: req.auth?.orgId || "personal",
        workspaceId: req.auth?.workspaceId || "default",
        reason: result.reason,
        ruleId: result.ruleId,
      },
    });
    return res.status(400).json({
      error: "Rejected by doctrine shield",
      reason: result.reason,
      ruleId: result.ruleId,
    });
  }

  next();
}
