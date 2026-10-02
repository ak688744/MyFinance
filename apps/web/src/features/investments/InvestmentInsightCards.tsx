import { useState } from 'react';
import type { InvestmentInsight } from '../../types';

const INITIAL_VISIBLE = 3;
const SHOW_MORE_STEP = 2;

/**
 * Deterministic MF portfolio insight cards — awareness only (no options/resolve).
 * Each card shows severity, title, expandable detail, Dismiss, and Discuss →.
 */
export function InvestmentInsightCards({
  insights,
  loading = false,
  isDismissed,
  onDismiss,
  onDiscuss,
}: {
  insights: InvestmentInsight[];
  loading?: boolean;
  isDismissed: (id: string) => boolean;
  onDismiss: (id: string) => void;
  onDiscuss: (insight: InvestmentInsight) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visible = insights.filter((i) => !isDismissed(i.id));

  if (visible.length === 0) {
    if (!loading) return null;
    return (
      <div className="border border-ai/20 border-l-4 border-l-ai bg-gradient-to-r from-ai/5 to-transparent rounded-card">
        <div className="w-full flex items-center gap-2 px-4 py-2.5 text-ai text-xs font-semibold uppercase tracking-wide">
          <Spinner />
          <span>AI Insights</span>
          <span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded font-bold">LIVE</span>
          <span className="text-ink-muted font-normal normal-case">· analyzing portfolio…</span>
        </div>
      </div>
    );
  }

  const shown = visible.slice(0, visibleCount);
  const remaining = visible.length - shown.length;

  return (
    <div className="border border-ai/20 border-l-4 border-l-ai bg-gradient-to-r from-ai/5 to-transparent rounded-card">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-ai text-xs font-semibold uppercase tracking-wide"
        aria-expanded={!collapsed}
      >
        {loading ? <Spinner /> : <span className="w-1.5 h-1.5 rounded-full bg-ai animate-pulse" aria-hidden />}
        <span>AI Insights</span>
        <span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded font-bold">LIVE</span>
        <span className="text-ink-muted font-normal normal-case">
          · {loading ? 'refreshing…' : `${visible.length} insight${visible.length === 1 ? '' : 's'}`}
        </span>
        <span className="ml-auto text-[10px] text-ai/60">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-ai/10 p-3">
          <ul className="divide-y divide-ai/10 border border-ai/10 rounded-card">
            {shown.map((insight) => (
              <InsightRow
                key={insight.id}
                insight={insight}
                onDismiss={onDismiss}
                onDiscuss={onDiscuss}
              />
            ))}
          </ul>

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + SHOW_MORE_STEP)}
              className="w-full text-xs font-medium text-ai hover:text-ai/80 py-1 mt-2"
            >
              Show {Math.min(SHOW_MORE_STEP, remaining)} more ({remaining} left) ▾
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InsightRow({
  insight,
  onDismiss,
  onDiscuss,
}: {
  insight: InvestmentInsight;
  onDismiss: (id: string) => void;
  onDiscuss: (insight: InvestmentInsight) => void;
}) {
  const [open, setOpen] = useState(false);
  const dotClass = insight.severity === 'warn' ? 'bg-amber-500' : 'bg-ink-muted/50';

  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm text-ink font-medium">{insight.title}</span>
        </button>
        <button
          onClick={() => onDismiss(insight.id)}
          className="shrink-0 text-ink-muted/50 hover:text-ink-muted text-base leading-none"
          aria-label={`Dismiss ${insight.title}`}
          title="Dismiss"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="mt-2 pl-4">
          {insight.detail && <div className="text-xs text-ink-muted">{insight.detail}</div>}
          <button
            onClick={() => onDiscuss(insight)}
            className="text-xs font-medium text-ai hover:text-ai/80 mt-2"
          >
            Discuss →
          </button>
        </div>
      )}
    </li>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin border-ai"
      aria-label="loading"
      role="status"
    />
  );
}
