// packages/core/test/unit/performance.fundStats.test.ts
import { describe, it, expect } from 'vitest';
import { benchmarkForFund, BENCHMARK_PROXIES } from '../../src/domain/performance/benchmarks';
import { computeFundStats, computeCategoryStats } from '../../src/domain/performance/fundStats';
import { pct1, inr0, performanceView } from '../../src/domain/performance/views';
import { txnsToFlows, txnsToLots, taxOptsFor } from '../../src/domain/performance/owned';
import { monthEndOf, shiftMonths, type Series } from '../../src/domain/performance/series';
import type { InvestmentTransaction } from '../../src/types';

function growth(annual: number, months = 128): Series {
  return Array.from({ length: months }, (_, k) => ({ date: monthEndOf(shiftMonths('2016-01-31', k)), nav: 100 * Math.pow(1 + annual, k / 12) }));
}
const asOf = '2026-08-31';

describe('benchmarks', () => {
  it('maps categories and index-fund names to proxies', () => {
    expect(benchmarkForFund('Equity: Small Cap', 'X')).toMatchObject({ kind: 'proxy', amfiCode: BENCHMARK_PROXIES.smallcap250.amfiCode });
    expect(benchmarkForFund('Equity: ELSS', 'X')).toMatchObject({ amfiCode: BENCHMARK_PROXIES.nifty500.amfiCode });
    expect(benchmarkForFund('Other: Index Funds', 'Axis Nifty 50 Index Fund')).toMatchObject({ amfiCode: BENCHMARK_PROXIES.nifty50.amfiCode });
    expect(benchmarkForFund('Other: Index Funds', 'Motilal Oswal Nifty Midcap 150 Index Fund')).toMatchObject({ amfiCode: BENCHMARK_PROXIES.midcap150.amfiCode });
    expect(benchmarkForFund('Hybrid: Arbitrage', 'X')).toMatchObject({ kind: 'category_median', category: 'Debt: Liquid' });
    expect(benchmarkForFund('Equity: Sectoral/ Thematic', 'X')).toBeNull();
  });
});

describe('fund and category stats', () => {
  it('computes trailing, rolling and capture stats vs a benchmark', () => {
    const s = computeFundStats({ amfiCode: 'F', monthly: growth(0.15), bench: growth(0.1), benchmarkCode: 'B', asOf });
    expect(s.r3y).toBeCloseTo(0.15, 6);
    expect(s.rolling3yBeatPct).toBe(1);
    expect(s.maxDrawdown5y).toBe(0);
    expect(s.benchmarkCode).toBe('B');
  });

  it('builds category quantiles and percentiles from rankable funds only', () => {
    const mk = (code: string, r: number, rankable = true) => ({
      stats: computeFundStats({ amfiCode: code, monthly: growth(r), bench: null, benchmarkCode: null, asOf }),
      category: 'Equity: Small Cap', rankable,
    });
    const { categoryStats, performance } = computeCategoryStats([mk('A', 0.1), mk('B', 0.2), mk('C', 0.3), mk('D', 0.9, false)], asOf);
    const r3 = categoryStats.find((c) => c.metric === 'r3y')!;
    expect(r3.n).toBe(3);
    expect(r3.median).toBeCloseTo(0.2, 6);
    expect(performance.find((p) => p.amfiCode === 'C')!.categoryPctile3y).toBeCloseTo(2 / 3, 6);
    expect(performance.find((p) => p.amfiCode === 'D')!.categoryPctile3y).toBeNull();
  });
});

describe('views and owned adapters', () => {
  it('rounds for display', () => {
    expect(pct1(0.11449)).toBe(11.4);
    expect(pct1(null)).toBeNull();
    expect(inr0(1234.6)).toBe(1235);
    expect(performanceView({ amfiCode: 'A', asOf, benchmarkCode: null, r1y: 0.1, r3y: null, r5y: null, r10y: null, vol3y: null,
      maxDrawdown5y: -0.24, rolling3yBeatPct: 0.04, rolling3yMedianExcess: -0.054, upCapture3y: null, downCapture3y: null,
      categoryPctile3y: 0.083, categoryPctile5y: null }).rolling3yMedianExcessPct).toBe(-5.4);
  });

  it('maps transactions to flows and lots, skipping dividends', () => {
    const t = (type: InvestmentTransaction['transactionType'], units: number, amount: number): InvestmentTransaction => ({
      id: 1, schemeId: 1, schemeName: 'F', accountName: 'a', investmentApp: 'g', transactionType: type, units, nav: amount / units, amount, transactionDate: '2024-01-01',
    });
    const txns = [t('PURCHASE', 10, 1000), t('REDEMPTION', 5, 600), t('DIVIDEND', 1, 5)];
    expect(txnsToFlows(txns).map((f) => f.type)).toEqual(['buy', 'sell']);
    expect(txnsToLots(txns).map((l) => l.units)).toEqual([10, 5]);
  });

  it('derives tax options from category, falling back to asset class and name', () => {
    expect(taxOptsFor('Equity: ELSS', 'X', null)).toEqual({ taxRegime: 'equity', elss: true });
    expect(taxOptsFor('Debt: Liquid', 'X', null)).toEqual({ taxRegime: 'slab', elss: false });
    expect(taxOptsFor(null, 'ABSL ELSS Tax Saver', 'equity')).toEqual({ taxRegime: 'equity', elss: true });
    expect(taxOptsFor(null, 'X', null)).toBeNull();
  });
});
