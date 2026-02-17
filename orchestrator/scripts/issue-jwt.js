#!/usr/bin/env node

const crypto = require("crypto");

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function parseScopes(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const secret = process.env.JWT_SECRET || "";
const issuer = process.env.JWT_ISSUER || "neuroedge-auth";
const audience = process.env.JWT_AUDIENCE || "neuroedge-clients";
const expiresIn = argValue("--exp", "1h");
const subject = argValue("--sub", "local-dev-user");
const orgId = argValue("--org", "personal");
const workspaceId = argValue("--workspace", "default");
const scopes = parseScopes(
  argValue(
    "--scopes",
    "chat:write execute:run ai:infer mesh:read billing:read storage:write federation:read"
  )
);
const stripeCustomerId = argValue("--stripe", "");

if (!secret) {
  console.error("Missing JWT_SECRET in environment.");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const expRaw = String(expiresIn).trim();
let expSeconds = 3600;
if (/^\d+$/.test(expRaw)) {
  expSeconds = Number(expRaw);
} else if (/^\d+h$/.test(expRaw)) {
  expSeconds = Number(expRaw.slice(0, -1)) * 3600;
} else if (/^\d+m$/.test(expRaw)) {
  expSeconds = Number(expRaw.slice(0, -1)) * 60;
}

const payload = {
  sub: subject,
  iat: now,
  nbf: now,
  exp: now + expSeconds,
  iss: issuer,
  aud: audience,
  org_id: orgId,
  workspace_id: workspaceId,
  scopes,
};

if (stripeCustomerId) {
  payload.stripe_customer_id = stripeCustomerId;
}

function b64url(input) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return raw
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const header = { alg: "HS256", typ: "JWT" };
const encodedHeader = b64url(JSON.stringify(header));
const encodedPayload = b64url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;
const signature = crypto
  .createHmac("sha256", secret)
  .update(signingInput)
  .digest();
const token = `${signingInput}.${b64url(signature)}`;

console.log(token);
console.error("\nUse this header:");
console.error(`Authorization: Bearer ${token}`);
