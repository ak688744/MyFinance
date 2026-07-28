import type { ReactNode } from 'react';
import { formatINR, formatPercent } from '../../lib/format';

type CardProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: 'brand' | 'gain' | 'ai' | 'none';
};

export function Card({ children, className = '', interactive = false, accent = 'none' }: CardProps) {
  const accentBorder =
    accent === 'brand' ? 'border-t-2 border-t-brand' :
    accent === 'gain' ? 'border-t-2 border-t-gain' :
    accent === 'ai' ? 'border-t-2 border-t-ai' : '';

  return (
    <div
      className={`bg-surface rounded-card border border-border shadow-card p-4 ${accentBorder} ${
        interactive ? 'transition-all duration-200 hover:shadow-card-hover hover:border-border-strong cursor-default' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function KPIStat({
  label,
  value,
  delta,
  accent = 'none',
}: {
  label: string;
  value: string;
  delta?: number | null;
  accent?: 'brand' | 'gain' | 'loss' | 'none';
}) {
  const valueColor =
    accent === 'gain' ? 'text-gain' :
    accent === 'loss' ? 'text-loss' :
    accent === 'brand' ? 'text-brand' : 'text-ink';

  return (
    <Card accent={accent === 'brand' ? 'brand' : accent === 'gain' ? 'gain' : 'none'} interactive>
      <div className="text-[11px] text-ink-muted uppercase tracking-wider font-medium">{label}</div>
      <div className={`font-mono text-2xl mt-1 tabular font-semibold ${valueColor}`}>{value}</div>
      {delta !== undefined && delta !== null && (
        <div className={`text-sm mt-1 tabular font-medium ${delta >= 0 ? 'text-gain' : 'text-loss'}`}>
          {formatPercent(delta)}
        </div>
      )}
    </Card>
  );
}

export function Money({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  return <span className={`tabular font-mono ${className}`}>{formatINR(value)}</span>;
}

export function DeltaText({ value }: { value: number | null | undefined }) {
  const positive = (value ?? 0) >= 0;
  return <span className={`tabular font-mono ${positive ? 'text-gain' : 'text-loss'}`}>{formatINR(value)}</span>;
}

const BADGE_STYLES: Record<string, string> = {
  market: 'bg-brand/10 text-brand ring-1 ring-brand/20',
  computed: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/60',
  manual: 'bg-slate-100 text-ink-muted ring-1 ring-border',
};

export function Badge({ strategy }: { strategy: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE_STYLES[strategy] ?? 'bg-slate-100 text-ink-muted'}`}>
      {strategy}
    </span>
  );
}

export function FreshnessChip({ ageDays }: { ageDays?: number }) {
  if (ageDays === undefined) return null;
  return <span className="text-xs text-ink-subtle">Updated {ageDays}d ago</span>;
}

export function RangeToggle({
  value,
  onChange,
  options = ['1M', '6M', '1Y', 'ALL'],
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return (
    <div className="inline-flex gap-0.5 bg-canvas rounded-lg p-0.5 border border-border" role="group" aria-label="Time range">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            value === o ? 'bg-surface shadow-sm text-brand' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="font-heading font-semibold text-base text-ink">{children}</h2>
      {action}
    </div>
  );
}
