import { describe, it, expect } from 'vitest';
import { buildLots, classifyLots, estimateExitCost } from '../../src/domain/performance/lots';
import { TAX_RULES } from '../../src/domain/performance/taxRules';

const eq = { taxRegime: 'equity' as const, elss: false };

describe('buildLots', () => {
  it('consumes the oldest lots first on redemption', () => {
    const lots = buildLots([
      { date: '2024-01-01', type: 'buy', units: 10, nav: 10 },
      { date: '2024-06-01', type: 'buy', units: 10, nav: 12 },
      { date: '2024-09-01', type: 'sell', units: 15, nav: 13 },
    ]);
    expect(lots).toEqual([{ date: '2024-06-01', units: 5, costNav: 12 }]);
  });
});

describe('classifyLots', () => {
  it('splits short and long term at exactly 12 months', () => {
    const lots = [
      { date: '2025-09-28', units: 1, costNav: 100 },
      { date: '2025-09-27', units: 1, costNav: 100 },
    ];
    const s = classifyLots(lots, 150, '2026-09-28', eq);
    expect(s.shortTermGainInr).toBe(50);
    expect(s.longTermGainInr).toBe(50);
    expect(s.exitLoadWindowValueInr).toBe(0);
  });

  it('marks ELSS lots locked until their 3-year anniversary', () => {
    const lots = [
      { date: '2023-09-28', units: 1, costNav: 100 },
      { date: '2023-09-29', units: 2, costNav: 100 },
    ];
    const s = classifyLots(lots, 100, '2026-09-28', { taxRegime: 'equity', elss: true });
    expect(s.elssLockedValueInr).toBe(200);
    expect(s.elssLockedUntil).toBe('2026-09-29');
  });

  it('slab regime reports no short/long split', () => {
    const s = classifyLots([{ date: '2024-01-01', units: 1, costNav: 10 }], 12, '2026-09-28', { taxRegime: 'slab', elss: false });
    expect(s.shortTermGainInr).toBeNull();
    expect(s.unrealisedGainInr).toBe(2);
  });
});

describe('estimateExitCost', () => {
  it('applies the long-term exemption and rate', () => {
    const lots = [{ date: '2020-01-01', units: 1000, costNav: 100 }];
    const c = estimateExitCost(lots, 300, '2026-09-28', eq);
    expect(c.ltcgTaxInr).toBeCloseTo((200_000 - 125_000) * 0.125, 6);
    expect(c.stcgTaxInr).toBe(0);
    expect(c.exitLoadInr).toBe(0);
  });

  it('charges short-term tax and exit load on recent lots, skips ELSS-locked units', () => {
    const lots = [{ date: '2026-06-01', units: 10, costNav: 100 }];
    const c = estimateExitCost(lots, 110, '2026-09-28', eq);
    expect(c.stcgTaxInr).toBeCloseTo(100 * TAX_RULES.equity.shortTermRate, 6);
    expect(c.exitLoadInr).toBeCloseTo(1100 * 0.01, 6);
    const locked = estimateExitCost(lots, 110, '2026-09-28', { taxRegime: 'equity', elss: true });
    expect(locked.unitsSold).toBe(0);
    expect(locked.lockedUnitsSkipped).toBe(10);
  });

  it('does not estimate slab-regime tax', () => {
    const c = estimateExitCost([{ date: '2024-01-01', units: 1, costNav: 10 }], 12, '2026-09-28', { taxRegime: 'slab', elss: false });
    expect(c.totalInr).toBeNull();
    expect(c.note).toMatch(/slab/i);
  });
});
