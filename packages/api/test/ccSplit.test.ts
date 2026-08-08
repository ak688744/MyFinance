import { describe, it, expect } from 'vitest';
import { reconcile } from '../src/lib/ccSplit';

const items = (amts: number[]) => amts.map((a, i) => ({ date: '2026-06-0' + (i + 1), merchant: 'M' + i, amount: a }));

describe('reconcile', () => {
  it('matches against statement total when parsedTotal ~= detectedTotal', () => {
    const r = reconcile(items([500, -200, 1000]), 1300, 8000);
    expect(r.parsedTotal).toBe(1300);
    expect(r.matched).toBe(true);
    expect(r.reconciledAgainst).toBe('statementTotal');
    expect(r.carryover).toBe(8000 - 1300);
  });

  it('is unmatched when parsed != statement total', () => {
    const r = reconcile(items([500]), 1300, 8000);
    expect(r.matched).toBe(false);
    expect(r.reconciledAgainst).toBe('statementTotal');
  });

  it('falls back to bill amount when detectedTotal is null', () => {
    const r = reconcile(items([8000]), null, 8000);
    expect(r.reconciledAgainst).toBe('billAmount');
    expect(r.matched).toBe(true);
    expect(r.carryover).toBe(0);
  });
});
