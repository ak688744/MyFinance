import { describe, it, expect } from 'vitest';
import { buildInsightSeed } from './insightSeed';

describe('buildInsightSeed', () => {
  it('includes the concern and the flagged transactions', () => {
    const seed = buildInsightSeed(
      { id: 'needs-clarity:2026-08', type: 'needs_clarity', severity: 'info', title: '2 need clarity', detail: 'Unclear txns.', transactionIds: [1, 2], cta: { label: 'x' } },
      [{ id: 1, description: 'UPI-UNKNOWNBIZ', amount: 700 }, { id: 2, description: 'RANDOM', amount: 50 }],
    );
    expect(seed).toContain('Unclear txns.');
    expect(seed).toContain('#1');
    expect(seed).toContain('UPI-UNKNOWNBIZ');
    expect(seed).toContain('700');
  });
});
