import { describe, it, expect } from 'vitest';
import { replayCashflows } from '../../src/domain/performance/replay';
import type { Series } from '../../src/domain/performance/series';

const target: Series = [
  { date: '2024-01-01', nav: 10 },
  { date: '2024-07-01', nav: 11 },
  { date: '2025-01-01', nav: 12 },
];

describe('replayCashflows', () => {
  it('replaying into the same fund gives zero difference and equal XIRR', () => {
    const r = replayCashflows([{ date: '2024-01-01', type: 'buy', amountInr: 1000 }], target, '2025-01-01', 1200);
    if ('unavailable' in r) throw new Error(r.unavailable);
    expect(r.replayValueInr).toBeCloseTo(1200, 6);
    expect(r.diffInr).toBeCloseTo(0, 6);
    expect(r.replayXirr).toBeCloseTo(r.actualXirr!, 6);
    expect(r.replayXirr).toBeCloseTo(0.2, 2);
  });

  it('handles sells and reports a positive diff when the actual fund did better', () => {
    const r = replayCashflows(
      [
        { date: '2024-01-01', type: 'buy', amountInr: 1000 },
        { date: '2024-07-01', type: 'sell', amountInr: 550 },
      ],
      target,
      '2025-01-01',
      700,
    );
    if ('unavailable' in r) throw new Error(r.unavailable);
    // replay: 100 units, sell 50 at 11 → 50 units × 12 = 600
    expect(r.replayValueInr).toBeCloseTo(600, 6);
    expect(r.diffInr).toBeCloseTo(100, 6);
  });

  it('is unavailable without transactions or without benchmark NAV', () => {
    expect(replayCashflows([], target, '2025-01-01', 0)).toEqual({ unavailable: 'no transactions' });
    const r = replayCashflows([{ date: '2020-01-01', type: 'buy', amountInr: 10 }], target, '2025-01-01', 10);
    expect('unavailable' in r).toBe(true);
  });
});
