// frontend/src/pages/Login.tsx

import React, { useState } from "react";
import { useUI } from "@/services/uiStore";

const Login: React.FC = () => {
  const { setUser } = useUI();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /* ------------------ Handlers ------------------ */
  const handleLogin = () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    // Simulate API login
    const token = "dummy-jwt-token"; 
    setUser({ name: email.split("@")[0], email, token, guest: false });
  };

  const handleGuest = () => {
    setUser({ name: "Guest User", email: "", token: "", guest: true });
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "1rem" }}>🧠 NeuroEdge Login</h2>

        {error && <p style={{ color: "#ff4d4f" }}>{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />

        <button onClick={handleLogin} style={loginBtnStyle}>
          🔐 Login
        </button>

        <hr style={{ margin: "1rem 0" }} />

        <button onClick={handleGuest} style={guestBtnStyle}>
          👤 Continue as Guest
        </button>

        <p style={{ marginTop: "1rem", fontSize: "0.8rem", opacity: 0.7 }}>
          Guest mode uses local storage only. Full features require login.
        </p>
      </div>
    </div>
  );
};

/* -------------------- */
/* Styles */
/* -------------------- */
const containerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
  color: "#e2e8f0",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.7)",
  padding: "2rem",
  borderRadius: "16px",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
  width: "320px",
  display: "flex",
  flexDirection: "column",
};

const inputStyle: React.CSSProperties = {
  padding: "0.75rem",
  marginBottom: "0.75rem",
  borderRadius: "6px",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  outline: "none",
  background: "rgba(15, 23, 42, 0.7)",
  color: "#e2e8f0",
};

const loginBtnStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: "6px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

const guestBtnStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: "6px",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

export default Login;
