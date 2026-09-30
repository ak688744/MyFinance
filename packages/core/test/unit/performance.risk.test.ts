import { describe, it, expect } from 'vitest';
import { maxDrawdown, annualVol, captureRatios } from '../../src/domain/performance/risk';
import { monthEndOf, shiftMonths, type Series } from '../../src/domain/performance/series';

function fromReturns(monthly: number[], start = 100): Series {
  const out: Series = [{ date: '2023-08-31', nav: start }];
  let nav = start;
  monthly.forEach((r, i) => {
    nav *= 1 + r;
    out.push({ date: monthEndOf(shiftMonths('2023-08-31', i + 1)), nav });
  });
  return out;
}

describe('risk', () => {
  it('maxDrawdown on a V shape', () => {
    const s: Series = [
      { date: '2024-01-31', nav: 100 }, { date: '2024-02-29', nav: 120 },
      { date: '2024-03-31', nav: 90 }, { date: '2024-04-30', nav: 130 },
    ];
    expect(maxDrawdown(s, '2024-01-01', '2024-12-31')).toBeCloseTo(-0.25, 10);
    expect(maxDrawdown(s, '2025-01-01', '2025-12-31')).toBeNull();
  });

  it('annualVol is 0 for a constant-growth series and positive when returns alternate', () => {
    const flat = fromReturns(Array(36).fill(0.01));
    const asOf = flat[flat.length - 1].date;
    expect(annualVol(flat, asOf, 3)).toBeCloseTo(0, 10);
    const choppy = fromReturns(Array.from({ length: 36 }, (_, i) => (i % 2 ? 0.05 : -0.05)));
    expect(annualVol(choppy, choppy[choppy.length - 1].date, 3)!).toBeGreaterThan(0.1);
  });

  it('captureRatios of a 1.5x-levered fund are 1.5 up and down', () => {
    const benchR = Array.from({ length: 36 }, (_, i) => (i % 3 === 0 ? -0.02 : 0.03));
    const bench = fromReturns(benchR);
    const fund = fromReturns(benchR.map((r) => r * 1.5));
    const asOf = bench[bench.length - 1].date;
    const c = captureRatios(fund, bench, asOf, 3);
    expect(c.up).toBeCloseTo(1.5, 6);
    expect(c.down).toBeCloseTo(1.5, 6);
  });
});
