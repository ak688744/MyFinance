import { useState } from 'react';
import type { Insight, InsightOption } from '../../types';

const INITIAL_VISIBLE = 3;
const SHOW_MORE_STEP = 2;

function haptic() {
  // Best-effort tactile feedback (supported on Android/Chrome; no-op elsewhere).
  try { navigator.vibrate?.(15); } catch { /* ignore */ }
}

/**
 * Triaged AI insights, split into two lanes:
 *   • Needs input — the data-completeness work queue. Each card is COLLAPSED to its
 *     title; clicking a row expands its options/text/Discuss. Resolve INLINE: tap an
 *     option (applies its tags/category-fix in one shot) or type a short answer.
 *   • Worth knowing — awareness only, no question (dismiss to clear).
 * Only the first few cards render; "Show more" reveals more in steps.
 */
export function InsightCards({
  insights,
  loading = false,
  isDismissed,
  onDismiss,
  onResolveOption,
  onResolveText,
  onDiscuss,
  resolvingId,
}: {
  insights: Insight[];
  loading?: boolean;
  isDismissed: (id: string) => boolean;
  onDismiss: (id: string) => void;
  onResolveOption: (insight: Insight, option: InsightOption) => void;
  onResolveText: (insight: Insight, text: string) => void;
  onDiscuss: (insight: Insight) => void;
  resolvingId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visible = insights.filter((i) => !isDismissed(i.eventId));

  // While computing insights (cold load can take ~20s for LLM triage), show the tab
  // with a loading indicator rather than hiding it. Only render nothing when we've
  // finished and there's genuinely nothing to show.
  if (visible.length === 0) {
    if (!loading) return null;
    return (
      <div className="border border-ai/20 border-l-4 border-l-ai bg-gradient-to-r from-ai/5 to-transparent rounded-card">
        <div className="w-full flex items-center gap-2 px-4 py-2.5 text-ai text-xs font-semibold uppercase tracking-wide">
          <Spinner />
          <span>AI Insights</span>
          <span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded font-bold">LIVE</span>
          <span className="text-ink-muted font-normal normal-case">· analyzing this month…</span>
        </div>
      </div>
    );
  }

  // Order needs_input first (the work queue), then worth_knowing; cap by visibleCount.
  const ordered = [
    ...visible.filter((i) => i.tier === 'needs_input'),
    ...visible.filter((i) => i.tier === 'worth_knowing'),
  ];
  const shown = ordered.slice(0, visibleCount);
  const needsInput = shown.filter((i) => i.tier === 'needs_input');
  const worthKnowing = shown.filter((i) => i.tier === 'worth_knowing');
  const remaining = ordered.length - shown.length;

  const totalNeeds = visible.filter((i) => i.tier === 'needs_input').length;
  const totalKnow = visible.length - totalNeeds;

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
          · {loading ? 'refreshing…' : `${totalNeeds} to resolve${totalKnow ? `, ${totalKnow} to know` : ''}`}
        </span>
        <span className="ml-auto text-[10px] text-ai/60">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-ai/10 p-3 space-y-4">
          {needsInput.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ai/70 mb-2 px-1">Needs your input</h4>
              <ul className="space-y-2">
                {needsInput.map((insight) => (
                  <NeedsInputCard
                    key={insight.eventId}
                    insight={insight}
                    resolving={resolvingId === insight.eventId}
                    onResolveOption={onResolveOption}
                    onResolveText={onResolveText}
                    onDiscuss={onDiscuss}
                    onDismiss={onDismiss}
                  />
                ))}
              </ul>
            </section>
          )}

          {worthKnowing.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2 px-1">Worth knowing</h4>
              <ul className="divide-y divide-ai/10 border border-ai/10 rounded-card">
                {worthKnowing.map((insight) => (
                  <WorthKnowingRow key={insight.eventId} insight={insight} onDismiss={onDismiss} />
                ))}
              </ul>
            </section>
          )}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + SHOW_MORE_STEP)}
              className="w-full text-xs font-medium text-ai hover:text-ai/80 py-1"
            >
              Show {Math.min(SHOW_MORE_STEP, remaining)} more ({remaining} left) ▾
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WorthKnowingRow({ insight, onDismiss }: { insight: Insight; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-ink-muted/50" aria-hidden />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm text-ink font-medium">{insight.refinedTitle}</span>
        </button>
        <button
          onClick={() => onDismiss(insight.eventId)}
          className="shrink-0 text-ink-muted/50 hover:text-ink-muted text-base leading-none"
          aria-label={`Dismiss ${insight.refinedTitle}`}
          title="Dismiss"
        >
          ×
        </button>
      </div>
      {open && insight.refinedDetail && (
        <div className="text-xs text-ink-muted mt-1 pl-4">{insight.refinedDetail}</div>
      )}
    </li>
  );
}

function NeedsInputCard({
  insight,
  resolving,
  onResolveOption,
  onResolveText,
  onDiscuss,
  onDismiss,
}: {
  insight: Insight;
  resolving: boolean;
  onResolveOption: (insight: Insight, option: InsightOption) => void;
  onResolveText: (insight: Insight, text: string) => void;
  onDiscuss: (insight: Insight) => void;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  // Once a resolve finishes the card usually vanishes; if it doesn't, clear pending.
  if (!resolving && pendingLabel) setPendingLabel(null);

  const handleOption = (opt: InsightOption) => {
    haptic();
    setPendingLabel(opt.label);
    onResolveOption(insight, opt);
  };

  return (
    <li className="border border-ai/15 rounded-card bg-white">
      {/* Collapsed header row — click to expand this insight. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 p-3 text-left"
        aria-expanded={open}
      >
        <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-ai" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-sm text-ink font-medium">{insight.refinedTitle}</span>
          {resolving && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-ai">
              <Spinner /> applying…
            </span>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-ai/60 mt-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-8">
          {insight.refinedDetail && <div className="text-xs text-ink-muted">{insight.refinedDetail}</div>}
          {insight.question && <div className="text-sm text-ink mt-2">{insight.question}</div>}

          {/* Option buttons — one tap applies the option's tags/category fix. */}
          {insight.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {insight.options.map((opt) => {
                const isPending = pendingLabel === opt.label;
                return (
                  <button
                    key={opt.label}
                    disabled={resolving}
                    onClick={() => handleOption(opt)}
                    className={
                      isPending
                        ? 'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-ai text-white'
                        : 'text-xs px-2.5 py-1 rounded-full border border-ai/30 text-ai hover:bg-ai/10 disabled:opacity-40 transition-colors'
                    }
                    title={`Tag: ${opt.tags.join(', ')}${opt.categoryFix ? ` · recategorize → ${opt.categoryFix}` : ''}`}
                  >
                    {isPending && <Spinner light />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Free-text single-shot answer. */}
          <form
            className="flex gap-1.5 mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = text.trim();
              if (t) { haptic(); onResolveText(insight, t); setText(''); }
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={resolving}
              placeholder="Or explain in your words…"
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ai/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={resolving || !text.trim()}
              className="text-xs px-2.5 py-1 rounded bg-ai text-white disabled:opacity-40"
            >
              Apply
            </button>
          </form>

          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => onDiscuss(insight)} className="text-xs font-medium text-ai hover:text-ai/80">
              Discuss →
            </button>
            <button onClick={() => onDismiss(insight.eventId)} className="text-xs text-ink-muted/60 hover:text-ink-muted">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin ${light ? 'border-white' : 'border-ai'}`}
      aria-label="loading"
      role="status"
    />
  );
}
