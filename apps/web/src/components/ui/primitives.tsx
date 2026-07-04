import type { ReactNode } from 'react';
import { formatINR, formatPercent } from '../../lib/format';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-card shadow-card p-5 ${className}`}>{children}</div>;
}

export function KPIStat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <Card>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="font-heading text-2xl mt-1 tabular">{value}</div>
      {delta !== undefined && delta !== null && (
        <div className={`text-sm mt-1 tabular ${delta >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPercent(delta)}</div>
      )}
    </Card>
  );
}

export function Money({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  return <span className={`tabular ${className}`}>{formatINR(value)}</span>;
}

export function DeltaText({ value }: { value: number | null | undefined }) {
  const positive = (value ?? 0) >= 0;
  return <span className={`tabular ${positive ? 'text-gain' : 'text-loss'}`}>{formatINR(value)}</span>;
}

const BADGE_STYLES: Record<string, string> = {
  market: 'bg-blue-50 text-brand',
  computed: 'bg-amber-50 text-amber-700',
  manual: 'bg-gray-100 text-gray-600',
};

export function Badge({ strategy }: { strategy: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE_STYLES[strategy] ?? 'bg-gray-100 text-gray-600'}`}>
      {strategy}
    </span>
  );
}

export function FreshnessChip({ ageDays }: { ageDays?: number }) {
  if (ageDays === undefined) return null;
  return <span className="text-xs text-gray-400">Updated {ageDays}d ago</span>;
}

export function RangeToggle({ value, onChange, options = ['1M', '6M', '1Y', 'ALL'] }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  return (
    <div className="inline-flex gap-1 bg-gray-100 rounded-lg p-1">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`text-xs px-2 py-1 rounded ${value === o ? 'bg-white shadow-sm text-brand' : 'text-gray-500'}`}>{o}</button>
      ))}
    </div>
  );
}
