import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Series = { name: string; data: number[] };

const PALETTE = ["#c9a84c", "#3b82f6", "#10b981", "#ef4444", "#a855f7", "#f97316"];

export function Chart({
  type = "bar",
  categories = [],
  series = [],
  height = 360,
  color,
}: {
  type?: "bar" | "line" | "pie";
  categories?: string[];
  series?: Series[];
  height?: number;
  color?: string;
}) {
  if (type === "pie") {
    const d = categories.map((c, i) => ({ name: c, value: series[0]?.data?.[i] ?? 0 }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={d} dataKey="value" nameKey="name" outerRadius="80%" label>
            {d.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const rows = categories.map((c, i) => {
    const row: Record<string, string | number> = { name: c };
    series.forEach((s) => (row[s.name] = s.data[i] ?? 0));
    return row;
  });

  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" stroke="currentColor" />
          <YAxis stroke="currentColor" />
          <Tooltip />
          <Legend />
          {series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={color || PALETTE[i % PALETTE.length]}
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis dataKey="name" stroke="currentColor" />
        <YAxis stroke="currentColor" />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={s.name} dataKey={s.name} fill={color || PALETTE[i % PALETTE.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}