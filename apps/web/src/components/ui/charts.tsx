import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, LabelList } from 'recharts';
import { formatINR, formatCompactShort } from '../../lib/format';

const PALETTE = ['#1463F3', '#0E9F6E', '#7C5CFC', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#10B981', '#6B7280'];

/** Shared tooltip that shows the exact ₹ amount (charts themselves render compact). */
function ExactTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  // For the month bar chart the payload name is the dataKey ("spent"); prefer the
  // axis label (the YYYY-MM) and format it. For the donut, name is the category.
  const heading = /^\d{4}-\d{2}$/.test(String(label)) ? monthLabel(String(label)) : (p.name ?? label);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="text-gray-500">{heading}</div>
      <div className="font-heading tabular text-sm">{formatINR(p.value)}</div>
    </div>
  );
}

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
  const total = data.reduce((s, d) => s + d.value, 0);
  // Label slices with a >=6% share directly on the chart (name + %); smaller
  // slices stay legend/tooltip-only to avoid clutter.
  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name, value } = props;
    const pct = total > 0 ? (value / total) * 100 : 0;
    if (pct < 6) return null;
    const RAD = Math.PI / 180;
    const r = outerRadius + 18;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text x={x} y={y} fill="#374151" fontSize={11} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {name} {pct.toFixed(0)}%
      </text>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={2} labelLine={false} label={renderLabel}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip content={<ExactTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SpendBarChart({ data }: { data: { month: string; spent: number }[] }) {
  if (!data || data.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthLabel} />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgba(20,99,243,0.06)' }} content={<ExactTooltip />} />
        <Bar dataKey="spent" fill="#1463F3" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="spent" position="top" formatter={(v: number) => formatCompactShort(v)} style={{ fontSize: 11, fill: '#374151' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-05" -> "May 26" for a compact x-axis tick. */
function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return `${MON[mo - 1]} ${String(y).slice(2)}`;
}
