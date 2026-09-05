import { describe, it, expect } from 'vitest';
import { buildInsightSeed } from './insightSeed';
import type { Insight } from '../../types';

const insight: Insight = {
  eventId: 'event:needs-clarity:2026-08', signature: 'sig', tier: 'needs_input', keep: true,
  lane: 'needs_input', refinedTitle: '2 need clarity', refinedDetail: 'Unclear txns.',
  question: 'Recurring or one-off?', options: [], reason: '', txnIds: [1, 2],
};

describe('buildInsightSeed', () => {
  it('includes the concern and the flagged transactions', () => {
    const seed = buildInsightSeed(insight, [
      { id: 1, description: 'UPI-UNKNOWNBIZ', amount: 700 },
      { id: 2, description: 'RANDOM', amount: 50 },
    ]);
    expect(seed).toContain('Unclear txns.');
    expect(seed).toContain('#1');
    expect(seed).toContain('UPI-UNKNOWNBIZ');
    expect(seed).toContain('700');
  });

  it('folds the user free-text explanation into the seed', () => {
    const seed = buildInsightSeed(insight, [{ id: 1, description: 'UPI-X', amount: 700 }], 'It was my car down payment');
    expect(seed).toContain('It was my car down payment');
  });
});
