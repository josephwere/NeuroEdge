// frontend/src/components/dashboard/ExecutionStatsChart.tsx
import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ExecutionStatsChartProps {
  stats: {
    executedCommands: number;
    successCount: number;
    failureCount: number;
  };
}

const COLORS = ["#36c36c", "#ff4d4f"];

const ExecutionStatsChart: React.FC<ExecutionStatsChartProps> = ({ stats }) => {
  const data = [
    { name: "Success", value: stats.successCount },
    { name: "Failure", value: stats.failureCount },
  ];

  return (
    <div
      style={{
        width: "300px",
        height: "300px",
        background: "#1e1e2f",
        borderRadius: "12px",
        padding: "1rem",
        color: "#fff",
      }}
    >
      <h3 style={{ marginBottom: "0.5rem" }}>✅ Command Success vs Failure</h3>
      <ResponsiveContainer width="100%" height="80%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={80}
            fill="#8884d8"
            label
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "#333", borderRadius: "8px", color: "#fff" }}
            formatter={(value: number) => [`${value}`, "Commands"]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ExecutionStatsChart;
