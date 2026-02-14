import React from "react";

export const ApprovalCard = ({ message, onApprove, onReject }: any) => (
  <div style={{ background: "#ffe", padding: 10, marginTop: 6 }}>
    <strong>{message}</strong>
    <div>
      <button onClick={onApprove}>Approve</button>
      <button onClick={onReject} style={{ marginLeft: 6 }}>Reject</button>
    </div>
  </div>
);
