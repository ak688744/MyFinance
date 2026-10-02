import { describe, it, expect } from 'vitest';
import { navOn, shiftMonths, toMonthEnd, previousMonthEnd, monthEndOf } from '../../src/domain/performance/series';
import { median, quantiles, percentileOf } from '../../src/domain/performance/category';
import { trailingReturn, relativeRolling } from '../../src/domain/performance/returns';
import type { Series } from '../../src/domain/performance/series';

/** Month-end series growing at a constant annual rate from 2016-01-31. */
function growth(annual: number, months = 128, start = 100): Series {
  const out: Series = [];
  for (let k = 0; k < months; k++) {
    out.push({ date: monthEndOf(shiftMonths('2016-01-31', k)), nav: start * Math.pow(1 + annual, k / 12) });
  }
  return out;
}

describe('series helpers', () => {
  it('shiftMonths clamps to month length', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(shiftMonths('2026-08-31', -12)).toBe('2025-08-31');
  });
  it('previousMonthEnd', () => {
    expect(previousMonthEnd('2026-09-29')).toBe('2026-08-31');
    expect(previousMonthEnd('2026-01-15')).toBe('2025-12-31');
  });
  it('navOn takes the latest point on or before the date, within tolerance', () => {
    const s: Series = [{ date: '2026-08-29', nav: 10 }, { date: '2026-09-29', nav: 11 }];
    expect(navOn(s, '2026-08-31')).toBe(10);
    expect(navOn(s, '2026-08-28')).toBeNull();
    expect(navOn(s, '2026-09-20')).toBeNull(); // 22 days after the last point before it
  });
  it('toMonthEnd keeps the last point of each month', () => {
    const s: Series = [{ date: '2026-08-01', nav: 1 }, { date: '2026-08-29', nav: 2 }, { date: '2026-09-02', nav: 3 }];
    expect(toMonthEnd(s)).toEqual([{ date: '2026-08-29', nav: 2 }, { date: '2026-09-02', nav: 3 }]);
  });
});

describe('quantiles', () => {
  it('median, quartiles and percentile', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantiles([1, 2, 3, 4, 5])).toEqual({ p25: 2, median: 3, p75: 4, n: 5 });
    expect(quantiles([])).toBeNull();
    expect(percentileOf(3, [1, 2, 3, 4])).toBe(0.5);
    expect(percentileOf(null, [1])).toBeNull();
  });
});

describe('returns', () => {
  it('trailingReturn recovers a constant CAGR', () => {
    const s = growth(0.12);
    const asOf = s[s.length - 1].date;
    expect(trailingReturn(s, asOf, 1)).toBeCloseTo(0.12, 6);
    expect(trailingReturn(s, asOf, 5)).toBeCloseTo(0.12, 6);
    expect(trailingReturn(s, asOf, 20)).toBeNull();
  });
  it('relativeRolling: a faster fund beats the benchmark in every window', () => {
    const fund = growth(0.15);
    const bench = growth(0.1);
    const asOf = fund[fund.length - 1].date;
    const r = relativeRolling(fund, bench, asOf);
    expect(r.windows).toBe(24);
    expect(r.beatPct).toBe(1);
    expect(r.medianExcess).toBeCloseTo(0.05, 6);
  });
  it('relativeRolling returns nulls without overlapping history', () => {
    expect(relativeRolling([], growth(0.1), '2026-08-31')).toEqual({ beatPct: null, medianExcess: null, windows: 0 });
  });
});
