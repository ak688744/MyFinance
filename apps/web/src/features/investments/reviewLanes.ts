import type { ReviewCard, ReviewCardKind, UniverseStatus } from '../../types';

export const REVIEW_TITLE = 'Portfolio review';
export const REVIEW_FOOTNOTE = 'Analysis, not advice. Tax figures are estimates — verify before acting.';

export const LANES: { kind: ReviewCardKind; label: string }[] = [
  { kind: 'dragging', label: 'Dragging' },
  { kind: 'working', label: 'Working' },
  { kind: 'consider', label: 'Consider' },
  { kind: 'data_quality', label: 'Data issues' },
];

export function groupReviewCards(
  cards: ReviewCard[],
  isDismissed: (id: string) => boolean = () => false,
): { kind: ReviewCardKind; label: string; cards: ReviewCard[] }[] {
  return LANES.map((l) => ({ ...l, cards: cards.filter((c) => c.kind === l.kind && !isDismissed(c.id)) })).filter(
    (l) => l.cards.length > 0,
  );
}

/** The fund universe is rebuilt monthly; older than this, the page triggers a background rebuild. */
export const UNIVERSE_MAX_AGE_DAYS = 30;

export function universeNeedsRefresh(status: UniverseStatus | undefined, nowMs = Date.now()): boolean {
  if (!status || status.state === 'running') return false;
  if (!status.builtAt) return true;
  return (nowMs - Date.parse(status.builtAt)) / 86_400_000 > UNIVERSE_MAX_AGE_DAYS;
}

export function reviewUnavailableText(reason: string | undefined): string {
  switch (reason) {
    case 'universe_not_built':
      return 'The portfolio review needs fund performance data, which is being built in the background (about 15 minutes). Showing basic insights meanwhile.';
    case 'ai_not_configured':
    case 'provider_not_configured':
      return 'The portfolio review needs an AI model: assign one to "Investment Portfolio Review" in AI Settings. Showing basic insights meanwhile.';
    default:
      return 'The portfolio review is unavailable right now. Showing basic insights meanwhile.';
  }
}

export function buildReviewSeed(card: ReviewCard, fundNames: string[]): string {
  const funds = fundNames.length > 0 ? fundNames.join(', ') : `scheme IDs ${card.fundIds.join(', ')}`;
  return [
    `I'm looking at a card from my portfolio review: "${card.title}".`,
    `Detail: ${card.detail}`,
    `Funds involved: ${funds}.`,
    card.discussPrompt,
  ].join('\n');
}
