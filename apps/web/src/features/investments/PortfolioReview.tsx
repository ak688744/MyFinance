// apps/web/src/features/investments/PortfolioReview.tsx
import { useState } from 'react';
import type { InvestmentInsight, InvestmentReview, ReviewCard } from '../../types';
import { formatINR } from '../../lib/format';
import { InvestmentInsightCards } from './InvestmentInsightCards';
import { groupReviewCards, reviewUnavailableText, REVIEW_FOOTNOTE, REVIEW_TITLE } from './reviewLanes';

const DOT: Record<ReviewCard['kind'], string> = {
  dragging: 'bg-amber-500',
  working: 'bg-emerald-500',
  consider: 'bg-ai',
  data_quality: 'bg-ink-muted/50',
};

type Props = {
  review: InvestmentReview | undefined;
  loading: boolean;
  insights: InvestmentInsight[];
  insightsLoading: boolean;
  isDismissed: (id: string) => boolean;
  onDismiss: (id: string) => void;
  onDiscussCard: (card: ReviewCard) => void;
  onDiscussInsight: (insight: InvestmentInsight) => void;
};

export function PortfolioReview(p: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Fallback: while the review loads, or when it is unavailable, show the v1 deterministic cards.
  if (!p.review || p.review.reviewUnavailable) {
    return (
      <div className="flex flex-col gap-1">
        <p className="px-1 text-xs text-ink-muted">
          {p.loading && !p.review ? 'Preparing your portfolio review…' : reviewUnavailableText(p.review?.reason)}
        </p>
        <InvestmentInsightCards
          insights={p.insights}
          loading={p.insightsLoading}
          isDismissed={p.isDismissed}
          onDismiss={p.onDismiss}
          onDiscuss={p.onDiscussInsight}
        />
      </div>
    );
  }

  const profile = p.insights.find((i) => i.kind === 'portfolio_profile');
  const lanes = groupReviewCards(p.review.cards, p.isDismissed);

  return (
    <div className="border border-ai/20 border-l-4 border-l-ai bg-gradient-to-r from-ai/5 to-transparent rounded-card">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-ai text-xs font-semibold uppercase tracking-wide"
        aria-expanded={!collapsed}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-ai" aria-hidden />
        <span>{REVIEW_TITLE}</span>
        <span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded font-bold">AI</span>
        {p.review.asOf && <span className="text-ink-muted font-normal normal-case">· performance as of {p.review.asOf}</span>}
        <span className="ml-auto text-[10px] text-ai/60">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-ai/10 p-3 flex flex-col gap-3">
          {profile && (
            <p className="text-sm text-ink">
              {profile.title}
              {profile.detail && <span className="text-ink-muted"> — {profile.detail}</span>}
            </p>
          )}
          {p.review.summary && <p className="text-sm text-ink-muted">{p.review.summary}</p>}

          {lanes.map((lane) => (
            <section key={lane.kind}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1">{lane.label}</h3>
              <ul className="divide-y divide-ai/10 border border-ai/10 rounded-card">
                {lane.cards.map((card) => (
                  <ReviewRow key={card.id} card={card} onDismiss={p.onDismiss} onDiscuss={p.onDiscussCard} />
                ))}
              </ul>
            </section>
          ))}
          {lanes.length === 0 && <p className="text-xs text-ink-muted">Nothing needs attention right now.</p>}

          <p className="text-[11px] text-ink-muted">{REVIEW_FOOTNOTE}</p>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ card, onDismiss, onDiscuss }: { card: ReviewCard; onDismiss: (id: string) => void; onDiscuss: (c: ReviewCard) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2.5">
        <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${DOT[card.kind]}`} aria-hidden />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <span className="text-sm text-ink font-medium">{card.title}</span>
          {card.impactInr != null && (
            <span className="ml-2 text-xs text-ink-muted tabular-nums">{formatINR(card.impactInr)}</span>
          )}
        </button>
        <button
          onClick={() => onDismiss(card.id)}
          className="shrink-0 text-ink-muted/50 hover:text-ink-muted text-base leading-none"
          aria-label={`Dismiss ${card.title}`}
          title="Dismiss"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="mt-2 pl-4">
          <div className="text-xs text-ink-muted">{card.detail}</div>
          <button onClick={() => onDiscuss(card)} className="text-xs font-medium text-ai hover:text-ai/80 mt-2">
            Discuss →
          </button>
        </div>
      )}
    </li>
  );
}
