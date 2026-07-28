import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, LabelList } from 'recharts';
import { formatINR, formatCompactShort } from '../../lib/format';
import { CHART_PALETTE } from '../../lib/chartPalette';

const PALETTE = [...CHART_PALETTE];

/** USD formatter for AI-cost charts (sub-cent shows 4 dp, like the dashboard). */
function usd(n: number): string {
  if (!n) return '$0.00';
  return n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

/** Shared tooltip that shows the exact ₹ amount (charts themselves render compact). */
function ExactTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  // For the month bar chart the payload name is the dataKey ("spent"); prefer the
  // axis label (the YYYY-MM) and format it. For the donut, name is the category.
  const heading = /^\d{4}-\d{2}$/.test(String(label)) ? monthLabel(String(label)) : (p.name ?? label);
  return (
    <div className="bg-surface border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="text-ink-muted">{heading}</div>
      <div className="font-mono tabular text-sm font-semibold text-ink">{formatINR(p.value)}</div>
    </div>
  );
}

export function TrendChart({ data, emptyHint }: { data: { date: string; value: number }[]; emptyHint?: string }) {
  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-ink-subtle bg-canvas/50 rounded-lg border border-dashed border-border">{emptyHint ?? 'History not available yet.'}</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={192}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E40AF" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#1E40AF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke="#1E40AF" strokeWidth={2} fill="url(#g)" />
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
        <Bar dataKey="spent" fill="#1E40AF" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="spent" position="top" formatter={(v: number) => formatCompactShort(v)} style={{ fontSize: 11, fill: '#374151' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tooltip for the stacked USD cost chart: lists each model's cost + the day total. */
function UsdStackTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="text-gray-500 mb-1">{label}</div>
      {payload.filter((p: any) => p.value > 0).map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="font-mono text-[10px] text-gray-600 max-w-[180px] truncate">{p.dataKey}</span>
          <span className="tabular ml-auto">{usd(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 flex justify-between font-heading">
        <span>Total</span><span className="tabular">{usd(total)}</span>
      </div>
    </div>
  );
}

/**
 * Daily AI spend, one bar per day stacked by model (each model a distinct color).
 * `rows` are keyed by day + one numeric field per model id; `models` gives the
 * stack order + legend. Costs are USD (not ₹).
 */
export function UsdStackedBarChart({ rows, models }: { rows: Array<Record<string, number | string>>; models: string[] }) {
  if (!rows || rows.length === 0 || models.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgba(20,99,243,0.06)' }} content={<UsdStackTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
        {models.map((m, i) => (
          <Bar key={m} dataKey={m} stackId="cost" fill={PALETTE[i % PALETTE.length]}
            radius={i === models.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
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
