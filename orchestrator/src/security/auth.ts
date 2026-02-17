import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type JwtClaims = jwt.JwtPayload & {
  sub?: string;
  org_id?: string;
  workspace_id?: string;
  scopes?: string[] | string;
  scope?: string;
  stripe_customer_id?: string;
};

function parseScopes(claims?: JwtClaims): string[] {
  if (!claims) return [];
  const raw = claims.scopes ?? claims.scope;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseScopeList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isTruthy(v?: string): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

function getBearerToken(req: Request): string | null {
  const auth = req.header("authorization") || req.header("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1].trim() || null;
}

function getApiKey(req: Request): string | null {
  const xApiKey = req.header("x-api-key");
  if (xApiKey) return xApiKey;
  const bearer = getBearerToken(req);
  return bearer;
}

function verifyJwt(token: string): JwtClaims | null {
  const hsSecret = process.env.JWT_SECRET || "";
  const rsPublic = process.env.JWT_PUBLIC_KEY || "";
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  try {
    if (hsSecret) {
      return jwt.verify(token, hsSecret, {
        algorithms: ["HS256", "HS384", "HS512"],
        issuer,
        audience,
      }) as JwtClaims;
    }
    if (rsPublic) {
      return jwt.verify(token, rsPublic, {
        algorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
        issuer,
        audience,
      }) as JwtClaims;
    }
    return null;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const publicRoutes = new Set(["/health", "/status", "/metrics", "/system/status"]);
  if (req.method === "GET" && publicRoutes.has(req.path)) {
    req.auth = {
      sub: "public",
      orgId: process.env.DEFAULT_ORG_ID || "personal",
      workspaceId: process.env.DEFAULT_WORKSPACE_ID || "default",
      scopes: ["public:read"],
    };
    return next();
  }

  const authRequired = process.env.AUTH_REQUIRED ? isTruthy(process.env.AUTH_REQUIRED) : true;
  const sharedApiKey = process.env.NEUROEDGE_API_KEY || process.env.KERNEL_API_KEY || "";
  const defaultOrgId = process.env.DEFAULT_ORG_ID || "personal";
  const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID || "default";

  const bearer = getBearerToken(req);
  const apiKey = getApiKey(req);
  const claims = bearer ? verifyJwt(bearer) : null;
  const apiKeyValid = !!sharedApiKey && !!apiKey && apiKey === sharedApiKey;
  const headerRole = String(req.header("x-user-role") || "").trim().toLowerCase();
  const headerEmail = String(req.header("x-user-email") || "").trim().toLowerCase();
  const headerName = String(req.header("x-user-name") || "").trim();
  const headerDeviceId = String(req.header("x-device-id") || "").trim();

  if (!claims && !apiKeyValid && authRequired) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const jwtScopes = parseScopes(claims || undefined);
  const apiKeyScopes = parseScopeList(
    process.env.API_KEY_SCOPES ||
      "chat:write execute:run ai:infer research:run mesh:read mesh:write billing:read storage:write federation:read federation:write training:read training:write identity:read identity:verify identity:write admin:read admin:write founder:*"
  );
  const scopes = jwtScopes.length > 0 ? jwtScopes : apiKeyValid ? apiKeyScopes : [];
  const requestedOrg = req.header("x-org-id") || undefined;
  const requestedWorkspace = req.header("x-workspace-id") || undefined;
  const mergedRaw = {
    ...(claims || {}),
    role: (claims?.role as string | undefined) || headerRole || undefined,
    email: (claims?.email as string | undefined) || headerEmail || undefined,
    name: (claims?.name as string | undefined) || headerName || undefined,
  };
  req.auth = {
    sub:
      (claims?.sub as string) ||
      (headerEmail ? `user:${headerEmail}` : "") ||
      (apiKeyValid ? "service-api-key" : "anonymous"),
    orgId: (claims?.org_id as string) || requestedOrg || defaultOrgId,
    workspaceId: (claims?.workspace_id as string) || requestedWorkspace || defaultWorkspaceId,
    deviceId: headerDeviceId || undefined,
    scopes: scopes.length > 0 ? scopes : [],
    raw: mergedRaw,
  };

  next();
}
