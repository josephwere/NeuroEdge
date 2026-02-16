import React from "react";

export const ApprovalCard = ({ message, onApprove, onReject }: any) => (
  <div
    style={{
      background: "rgba(15, 23, 42, 0.7)",
      border: "1px solid rgba(148, 163, 184, 0.2)",
      borderRadius: 10,
      padding: 10,
      marginTop: 6,
      color: "#e2e8f0",
    }}
  >
    <strong>{message}</strong>
    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
      <button onClick={onApprove} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "0.35rem 0.6rem", cursor: "pointer" }}>
        Approve
      </button>
      <button onClick={onReject} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "0.35rem 0.6rem", cursor: "pointer" }}>
        Reject
      </button>
    </div>
  </div>
);
