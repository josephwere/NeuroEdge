import React, { useState } from "react";
import { useUI } from "@/services/uiStore";
import { loadBranding } from "@/services/branding";

type AuthMethod = "email" | "google" | "github" | "phone";
type LoginRole = "user" | "founder" | "admin" | "developer" | "enterprise";
type LoginPlan = "free" | "pro" | "enterprise";

interface TestAccount {
  email: string;
  password: string;
  name: string;
  role: LoginRole;
  plan: LoginPlan;
}

interface LoginProps {
  embedded?: boolean;
  onSuccess?: () => void;
}

const Login: React.FC<LoginProps> = ({ embedded = false, onSuccess }) => {
  const { setUser } = useUI();
  const [method, setMethod] = useState<AuthMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [error, setError] = useState("");
  const [branding, setBranding] = useState(() => loadBranding());
  const devFounderEmail = String(import.meta.env.VITE_DEV_FOUNDER_EMAIL || "founder@neuroedge.ai").trim().toLowerCase();
  const devFounderPassword = String(import.meta.env.VITE_DEV_FOUNDER_PASSWORD || "Josboy@254");
  const testAccountsEnabled =
    String(import.meta.env.VITE_ENABLE_TEST_ACCOUNTS || "").trim().toLowerCase() === "true" || Boolean(import.meta.env.DEV);
  const defaultTestAccounts: TestAccount[] = [
    {
      email: devFounderEmail,
      password: devFounderPassword,
      name: "Joseph Were",
      role: "founder",
      plan: "enterprise",
    },
    {
      email: "admin@neuroedge.ai",
      password: "Admin@1234",
      name: "NeuroEdge Admin",
      role: "admin",
      plan: "enterprise",
    },
    {
      email: "developer@neuroedge.ai",
      password: "Dev@1234",
      name: "NeuroEdge Developer",
      role: "developer",
      plan: "pro",
    },
    {
      email: "enterprise@neuroedge.ai",
      password: "Enterprise@1234",
      name: "Enterprise User",
      role: "enterprise",
      plan: "enterprise",
    },
    {
      email: "user@neuroedge.ai",
      password: "User@1234",
      name: "Pilot User",
      role: "user",
      plan: "free",
    },
  ];
  const testAccounts = React.useMemo<TestAccount[]>(() => {
    const raw = String(import.meta.env.VITE_TEST_ACCOUNTS_JSON || "").trim();
    if (!raw) return defaultTestAccounts;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultTestAccounts;
      return parsed
        .map((item: any) => ({
          email: String(item?.email || "").trim().toLowerCase(),
          password: String(item?.password || ""),
          name: String(item?.name || "Pilot User"),
          role: String(item?.role || "user").trim().toLowerCase() as LoginRole,
          plan: String(item?.plan || "free").trim().toLowerCase() as LoginPlan,
        }))
        .filter((x) => x.email && x.password);
    } catch {
      return defaultTestAccounts;
    }
  }, [devFounderEmail, devFounderPassword]);

  React.useEffect(() => {
    const refreshBranding = () => setBranding(loadBranding());
    window.addEventListener("neuroedge:brandingUpdated", refreshBranding as EventListener);
    window.addEventListener("storage", refreshBranding);
    return () => {
      window.removeEventListener("neuroedge:brandingUpdated", refreshBranding as EventListener);
      window.removeEventListener("storage", refreshBranding);
    };
  }, []);

  const completeLogin = (payload: { name: string; email: string; provider: AuthMethod; phone?: string; role?: LoginRole; plan?: LoginPlan }) => {
    const token = `neuroedge-${payload.provider}-token`;
    setUser({
      name: payload.name,
      email: payload.email,
      token,
      guest: false,
      provider: payload.provider,
      phone: payload.phone,
      country: "global",
      role: payload.role || "user",
      plan: payload.plan || "free",
    });
    onSuccess?.();
  };

  const handleAuth = () => {
    setError("");
    if (method === "email") {
      if (!email.trim() || !password.trim()) {
        setError("Enter both email and password.");
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const matchingTestAccount =
        testAccountsEnabled
          ? testAccounts.find((acc) => acc.email === normalizedEmail && acc.password === password)
          : null;
      if (matchingTestAccount) {
        completeLogin({
          name: matchingTestAccount.name,
          email: matchingTestAccount.email,
          provider: "email",
          role: matchingTestAccount.role,
          plan: matchingTestAccount.plan,
        });
        return;
      }
      completeLogin({ name: email.split("@")[0] || "User", email, provider: "email", role: "user", plan: "free" });
      return;
    }

    if (method === "phone") {
      const normalized = `${countryCode}${phone}`.replace(/\s+/g, "");
      if (!phone.trim()) {
        setError("Enter a phone number.");
        return;
      }
      completeLogin({
        name: `PhoneUser-${normalized.slice(-4)}`,
        email: "",
        provider: "phone",
        phone: normalized,
      });
      return;
    }

    if (method === "google") {
      completeLogin({ name: "Google User", email: "google-user@neuroedge.local", provider: "google" });
      return;
    }

    completeLogin({ name: "GitHub User", email: "github-user@neuroedge.local", provider: "github" });
  };

  const handleGuest = () => {
    setUser({
      name: "Guest User",
      email: "",
      token: "",
      guest: true,
      provider: "guest",
      country: "global",
    });
    onSuccess?.();
  };

  return (
    <div
      style={container(
        embedded,
        branding.loginBackgroundUrl,
        branding.loginOverlayOpacity,
        branding.glassBlur
      )}
    >
      <div style={card}>
        <h2 style={{ margin: 0 }}>NeuroEdge Access</h2>
        <p style={muted}>
          Free chat is available without login. Sign in only if you want account sync.
        </p>

        <div style={methodRow}>
          {(["email", "google", "github", "phone"] as AuthMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{ ...methodBtn, ...(method === m ? methodBtnActive : {}) }}
            >
              {m}
            </button>
          ))}
        </div>

        {method === "email" && (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
            />
          </>
        )}

        {method === "phone" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="+1"
              style={{ ...input, maxWidth: 80 }}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number (E.164)"
              style={input}
            />
          </div>
        )}

        {error && <p style={{ color: "#f87171", margin: "0.4rem 0" }}>{error}</p>}

        <button onClick={handleAuth} style={primaryBtn}>
          Continue with {method}
        </button>

        <button onClick={handleGuest} style={secondaryBtn}>
          Continue Free as Guest
        </button>

        {testAccountsEnabled && method === "email" ? (
          <div style={testAccountsCard}>
            <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>Pilot Test Accounts</div>
            <div style={footnote}>Use these for APK pilot testing. Change/remove in production.</div>
            {testAccounts.map((acc) => (
              <div key={acc.email} style={testRow}>
                <span style={testBadge(acc.role)}>{acc.role}</span>
                <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>
                  {acc.email} / {acc.password}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p style={footnote}>
          Phone login supports international E.164 format for all countries.
        </p>
      </div>
    </div>
  );
};

const container = (embedded: boolean, loginBackgroundUrl: string, loginOverlayOpacity: number, blur: number): React.CSSProperties => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: embedded ? "auto" : "100vh",
  background: embedded
    ? "transparent"
    : `linear-gradient(rgba(2,6,23,${loginOverlayOpacity || 0.6}), rgba(2,6,23,${loginOverlayOpacity || 0.6})), ${loginBackgroundUrl ? `url(${loginBackgroundUrl}) center / cover no-repeat` : "linear-gradient(180deg, #0f172a 0%, #111827 100%)"}`,
  backdropFilter: `blur(${blur || 0}px)`,
  color: "#e2e8f0",
});

const card: React.CSSProperties = {
  width: 420,
  padding: "1.2rem",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(15, 23, 42, 0.7)",
  display: "grid",
  gap: 10,
};

const muted: React.CSSProperties = { margin: 0, color: "#94a3b8", fontSize: "0.86rem" };
const methodRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const methodBtn: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.3)",
  background: "rgba(15, 23, 42, 0.8)",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "0.35rem 0.55rem",
  cursor: "pointer",
  textTransform: "capitalize",
};
const methodBtnActive: React.CSSProperties = { border: "1px solid #60a5fa", background: "rgba(37, 99, 235, 0.25)" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.3)",
  background: "rgba(15, 23, 42, 0.75)",
  color: "#e2e8f0",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 0.7rem",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  textTransform: "capitalize",
};
const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: 8,
  padding: "0.55rem 0.7rem",
  background: "rgba(15, 23, 42, 0.8)",
  color: "#e2e8f0",
  cursor: "pointer",
};
const footnote: React.CSSProperties = { margin: 0, color: "#94a3b8", fontSize: "0.78rem" };
const testAccountsCard: React.CSSProperties = {
  marginTop: 6,
  padding: "0.6rem",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(2,6,23,0.5)",
  display: "grid",
  gap: 6,
};
const testRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};
const testBadge = (role: LoginRole): React.CSSProperties => ({
  borderRadius: 999,
  padding: "0.12rem 0.45rem",
  fontSize: "0.66rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  border: "1px solid rgba(148,163,184,0.4)",
  color: role === "founder" ? "#facc15" : role === "admin" ? "#60a5fa" : role === "developer" ? "#34d399" : "#cbd5e1",
});

export default Login;
