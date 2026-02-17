import { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const requestLog = new Map<string, number[]>();

function getIdentity(req: Request): string {
  const org = req.auth?.orgId || "unknown-org";
  const workspace = req.auth?.workspaceId || "unknown-workspace";
  const sub = req.auth?.sub || "anonymous";
  return `${org}:${workspace}:${sub}`;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${getIdentity(req)}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    const entries = (requestLog.get(key) || []).filter((t) => t >= cutoff);

    if (entries.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entries[0] + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Rate limit exceeded",
        key: keyPrefix,
        retryAfterSec,
      });
    }

    entries.push(now);
    requestLog.set(key, entries);
    next();
  };
}

