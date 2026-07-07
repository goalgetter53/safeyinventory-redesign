import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

export default function MonthlyChart({ data, products }: { data: any[]; products: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {products.map((p, i) => (
          <Bar key={p} dataKey={p} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === products.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
