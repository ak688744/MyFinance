import { describe, it, expect } from 'vitest';
import {
  groupReviewCards, universeNeedsRefresh, reviewUnavailableText, buildReviewSeed, UNIVERSE_MAX_AGE_DAYS,
} from '../src/features/investments/reviewLanes';
import type { ReviewCard, UniverseStatus } from '../src/types';

const card = (id: string, kind: ReviewCard['kind']): ReviewCard => ({
  id, kind, title: `T${id}`, detail: `D${id}`, fundIds: [9], impactInr: null, evidence: ['funds[0].x'], discussPrompt: 'Why is this lagging?',
});
const status = (o: Partial<UniverseStatus>): UniverseStatus => ({
  state: 'idle', startedAt: null, finishedAt: null, lastError: null, progress: null, builtAt: null, asOf: null, ...o,
});

describe('groupReviewCards', () => {
  it('orders lanes Dragging, Working, Consider, Data issues and omits empty or dismissed', () => {
    const lanes = groupReviewCards([card('1', 'consider'), card('2', 'dragging'), card('3', 'working'), card('4', 'dragging')], (id) => id === '4');
    expect(lanes.map((l) => l.label)).toEqual(['Dragging', 'Working', 'Consider']);
    expect(lanes[0].cards.map((c) => c.id)).toEqual(['2']);
  });
});

describe('universeNeedsRefresh', () => {
  const now = Date.parse('2026-09-30T00:00:00Z');
  it('refreshes when never built or older than the max age', () => {
    expect(universeNeedsRefresh(status({}), now)).toBe(true);
    expect(universeNeedsRefresh(status({ builtAt: '2026-08-15T00:00:00Z' }), now)).toBe(true);
    expect(universeNeedsRefresh(status({ builtAt: '2026-09-20T00:00:00Z' }), now)).toBe(false);
    expect(UNIVERSE_MAX_AGE_DAYS).toBe(30);
  });
  it('never triggers while running or before status loads', () => {
    expect(universeNeedsRefresh(status({ state: 'running' }), now)).toBe(false);
    expect(universeNeedsRefresh(undefined, now)).toBe(false);
  });
});

describe('copy helpers', () => {
  it('explains why the review is unavailable', () => {
    expect(reviewUnavailableText('universe_not_built')).toMatch(/performance data/i);
    expect(reviewUnavailableText('ai_not_configured')).toMatch(/AI Settings/);
    expect(reviewUnavailableText('provider_not_configured')).toMatch(/AI Settings/);
    expect(reviewUnavailableText('anything else')).toMatch(/unavailable/i);
  });
  it('seeds the Discuss drawer with the card, funds and follow-up question', () => {
    const seed = buildReviewSeed(card('1', 'dragging'), ['SBI Small Cap Fund']);
    expect(seed).toContain('T1');
    expect(seed).toContain('D1');
    expect(seed).toContain('SBI Small Cap Fund');
    expect(seed).toContain('Why is this lagging?');
    expect(buildReviewSeed(card('1', 'dragging'), [])).toContain('scheme IDs 9');
  });
});
