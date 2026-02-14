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
  background: "#f5f6fa",
  fontFamily: "Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  padding: "2rem",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  width: "320px",
  display: "flex",
  flexDirection: "column",
};

const inputStyle: React.CSSProperties = {
  padding: "0.75rem",
  marginBottom: "0.75rem",
  borderRadius: "6px",
  border: "1px solid #ccc",
  outline: "none",
};

const loginBtnStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: "6px",
  background: "#3a3aff",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

const guestBtnStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: "6px",
  background: "#2b2b3c",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

export default Login;
