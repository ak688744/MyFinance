import { describe, it, expect } from 'vitest';
import { buildFactSheet, pickCandidates, type FactSheetInput, type OwnedPositionInput } from '../../src/domain/performance/factSheet';
import type { FundPerformanceRow } from '../../src/types';

const perf = (amfiCode: string, o: Partial<FundPerformanceRow> = {}): FundPerformanceRow => ({
  amfiCode, asOf: '2026-08-31', benchmarkCode: 'B', r1y: 0.079, r3y: 0.114, r5y: 0.139, r10y: null,
  vol3y: 0.17, maxDrawdown5y: -0.224, rolling3yBeatPct: 0.042, rolling3yMedianExcess: -0.054,
  upCapture3y: 0.795, downCapture3y: 0.785, categoryPctile3y: 0.083, categoryPctile5y: 0.182, ...o,
});

const base: OwnedPositionInput = {
  schemeId: 9, schemeName: 'SBI Small Cap Fund Direct Growth', amfiCode: '125497', category: 'Equity: Small Cap',
  units: 10, valueInr: 1100, currentNav: 110,
  performance: perf('125497'),
  benchmark: { kind: 'proxy', amfiCode: 'B', label: 'Nifty Smallcap 250 (proxy)' },
  benchmarkPerformance: perf('B', { r1y: 0.073, r3y: 0.138, r5y: 0.142 }),
  benchmarkDaily: [{ date: '2024-01-01', nav: 10 }, { date: '2026-09-28', nav: 12 }],
  flows: [{ date: '2024-01-01', type: 'buy', amountInr: 1000 }],
  lots: [{ date: '2024-01-01', type: 'buy', units: 10, nav: 100 }],
  taxOpts: { taxRegime: 'equity', elss: false },
  directTwin: null,
};

const input = (positions: OwnedPositionInput[]): FactSheetInput => ({
  asOf: '2026-08-31', builtAt: '2026-09-01T00:00:00.000Z', today: '2026-09-28',
  positions,
  categoryStats: { 'Equity: Small Cap': [
    { category: 'Equity: Small Cap', metric: 'r3y', p25: 0.13, median: 0.151, p75: 0.18, n: 30, asOf: '2026-08-31' },
    { category: 'Equity: Small Cap', metric: 'r1y', p25: 0.05, median: 0.09, p75: 0.12, n: 30, asOf: '2026-08-31' },
  ] },
  candidates: {},
  allCategoryStats: [],
  profile: null,
  portfolioInsights: [],
  dataQuality: [],
});

describe('buildFactSheet', () => {
  it('rounds to display units and precomputes differences', () => {
    const fs = buildFactSheet(input([base]));
    const f = fs.funds[0];
    expect(f.returnsPct.r3y).toBe(11.4);
    expect(f.benchmarkReturnsPct?.r3y).toBe(13.8);
    expect(f.excessVsBenchmarkPct?.r3y).toBe(-2.4);
    expect(f.excessVsCategoryPct.r3y).toBe(-3.7);
    expect(f.rolling3y.beatPct).toBe(4.2);
    expect(f.categoryPercentile.r5y).toBe(18.2);
    expect(f.weightPct).toBe(100);
    expect('diffInr' in f.replay).toBe(true);
    expect('longTermGainInr' in f.lots).toBe(true);
  });

  it('marks lots and replay unavailable for a fund with no transactions (never zeros)', () => {
    const fs = buildFactSheet(input([{ ...base, flows: [], lots: [] }]));
    expect(fs.funds[0].lots).toEqual({ unavailable: 'no transactions imported' });
    expect(fs.funds[0].replay).toEqual({ unavailable: 'no transactions imported' });
  });

  it('marks replay and lots unavailable when transactions cover only part of the holding', () => {
    const f = buildFactSheet(input([{ ...base, transactionsPartial: true }])).funds[0];
    expect(f.replay).toEqual({ unavailable: 'transactions cover only part of this holding' });
    expect(f.lots).toEqual({ unavailable: 'transactions cover only part of this holding' });
  });

  it('uses the liquid-category median for arbitrage funds', () => {
    const arb: OwnedPositionInput = {
      ...base, schemeId: 7, category: 'Hybrid: Arbitrage',
      benchmark: { kind: 'category_median', category: 'Debt: Liquid', label: 'Liquid-fund category median' },
      benchmarkPerformance: null, benchmarkDaily: null,
      performance: perf('A', { r1y: 0.068, r3y: 0.075 }),
    };
    const i = input([arb]);
    i.categoryStats['Debt: Liquid'] = [
      { category: 'Debt: Liquid', metric: 'r1y', p25: 0.06, median: 0.065, p75: 0.07, n: 20, asOf: '2026-08-31' },
    ];
    const f = buildFactSheet(i).funds[0];
    expect(f.benchmarkReturnsPct?.r1y).toBe(6.5);
    expect(f.excessVsBenchmarkPct?.r1y).toBe(0.3);
    expect(f.replay).toEqual({ unavailable: 'no index benchmark for this category' });
  });

  it('reports plan drag in percent and rupees', () => {
    const f = buildFactSheet(input([{ ...base, valueInr: 291_318, directTwin: { amfiCode: '119544', schemeName: 'ABSL ELSS Direct', annualDrag: 0.0074 } }])).funds[0];
    expect(f.planDrag).toEqual({ twinName: 'ABSL ELSS Direct', twinAmfiCode: '119544', annualDragPct: 0.7, annualDragInr: 2156 });
  });
});

describe('pickCandidates', () => {
  it('ranks rankable, non-owned funds by rolling median excess', () => {
    const rows = [
      { ...perf('1', { rolling3yMedianExcess: 0.02 }), schemeName: 'One', rankable: true },
      { ...perf('2', { rolling3yMedianExcess: 0.09 }), schemeName: 'Two', rankable: true },
      { ...perf('3', { rolling3yMedianExcess: 0.5 }), schemeName: 'Young', rankable: false },
      { ...perf('4', { rolling3yMedianExcess: 0.3 }), schemeName: 'Owned', rankable: true },
    ];
    expect(pickCandidates(rows, new Set(['4']), 5).map((r) => r.schemeName)).toEqual(['Two', 'One']);
  });
});
