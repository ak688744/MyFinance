import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

const PALETTE = ['#1463F3', '#0E9F6E', '#7C5CFC', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#10B981', '#6B7280'];

export function TrendChart({ data, emptyHint }: { data: { date: string; value: number }[]; emptyHint?: string }) {
  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-gray-400">{emptyHint ?? 'History not available yet.'}</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={192}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1463F3" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#1463F3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke="#1463F3" fill="url(#g)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SpendBarChart({ data }: { data: { month: string; spent: number }[] }) {
  if (!data || data.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip />
        <Bar dataKey="spent" fill="#1463F3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
