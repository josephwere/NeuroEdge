import React from "react";

export const LogViewer = ({ logs }: { logs: string[] }) => (
  <div style={{
    background: "#111",
    color: "#0f0",
    padding: 10,
    fontFamily: "monospace",
    maxHeight: 200,
    overflowY: "auto"
  }}>
    {logs.map((l, i) => <div key={i}>{l}</div>)}
  </div>
);
