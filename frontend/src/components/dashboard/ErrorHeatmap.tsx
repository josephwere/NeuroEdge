// frontend/src/components/dashboard/ErrorHeatmap.tsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ErrorHeatmapProps {
  errorTypes: Record<string, number>;
}

const ErrorHeatmap: React.FC<ErrorHeatmapProps> = ({ errorTypes }) => {
  const data = Object.entries(errorTypes).map(([type, count]) => ({ type, count }));

  return (
    <div
      style={{
        flex: 1,
        minWidth: "300px",
        height: "300px",
        background: "#1e1e2f",
        borderRadius: "12px",
        padding: "1rem",
        color: "#fff",
      }}
    >
      <h3 style={{ marginBottom: "0.5rem" }}>⚠️ Error Types Frequency</h3>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={data}>
          <XAxis dataKey="type" stroke="#fff" />
          <YAxis stroke="#fff" />
          <Tooltip
            contentStyle={{ backgroundColor: "#333", borderRadius: "8px" }}
            formatter={(value: number) => [`${value}`, "Occurrences"]}
          />
          <Bar dataKey="count" fill="#faad14" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ErrorHeatmap;
