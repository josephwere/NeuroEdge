import { Request, Response, NextFunction } from "express";

function isTruthy(v?: string): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

function hasScope(scopes: string[], needed: string): boolean {
  if (scopes.includes("*") || scopes.includes("admin:*")) return true;
  if (scopes.includes(needed)) return true;
  const [domain] = needed.split(":");
  if (scopes.includes(`${domain}:*`)) return true;
  return false;
}

export function requireScope(needed: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const enforce = process.env.AUTHZ_ENFORCE_SCOPES ? isTruthy(process.env.AUTHZ_ENFORCE_SCOPES) : true;
    if (!enforce) return next();
    const scopes = req.auth?.scopes || [];
    if (!hasScope(scopes, needed)) {
      return res.status(403).json({ error: "Forbidden", missingScope: needed });
    }
    next();
  };
}

export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  const enforce = process.env.AUTHZ_REQUIRE_WORKSPACE ? isTruthy(process.env.AUTHZ_REQUIRE_WORKSPACE) : true;
  if (!enforce) return next();
  if (!req.auth?.orgId || !req.auth?.workspaceId) {
    return res.status(400).json({ error: "Missing workspace context" });
  }
  next();
}
