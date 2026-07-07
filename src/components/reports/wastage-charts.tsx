import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type ByReason = { reason: string; kg: number }[];
type ByDate = { date: string; kg: number }[];

export default function WastageCharts({ byReason, byDate }: { byReason: ByReason; byDate: ByDate }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={byReason}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="reason" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="kg" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={byDate}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="kg" stroke="var(--color-chart-4)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
