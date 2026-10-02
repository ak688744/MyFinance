import { describe, it, expect } from 'vitest';
import { computeInvestmentInsights } from '../../src/domain/investmentAnalysis/insights';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const mk = (id: number, hs: [string, number][]): OwnedFund => ({
  schemeId: id, schemeName: `F${id}`, category: 'equity', currentValueInr: 100000, planType: 'regular',
  expenseRatioDirect: 0.4, expenseRatioRegular: 1.4,
  holdings: hs.map(([n, w]) => ({ securityName: n, isin: null, weightPct: w, sector: null, marketCapBucket: null })),
});

describe('computeInvestmentInsights', () => {
  it('emits overlap (with rupee impact), cost, and goal insights but never stale_data', () => {
    const funds = [
      mk(1, [['HDFC', 60], ['ICICI', 20]]),
      mk(2, [['HDFC', 55], ['TCS', 25]]),
    ];
    const insights = computeInvestmentInsights({
      funds,
      profile: { horizonYears: 2, riskTolerance: 'low' },
    });
    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain('high_overlap');
    expect(kinds).toContain('cost_leak');
    expect(kinds).toContain('goal_drift');
    expect(kinds).not.toContain('stale_data');
    const overlap = insights.find((i) => i.kind === 'high_overlap')!;
    expect(overlap.severity).toBe('warn');
    expect(overlap.detail).toContain('₹');
  });

  it('downgrades overlap to info when the duplicated money is a small share of the portfolio', () => {
    const small = (id: number): OwnedFund => ({ ...mk(id, [['HDFC', 60], ['ICICI', 20]]), currentValueInr: 1000 });
    const big: OwnedFund = { ...mk(9, [['TCS', 90]]), currentValueInr: 1_000_000 };
    const insights = computeInvestmentInsights({ funds: [small(1), small(2), big] });
    const overlap = insights.find((i) => i.kind === 'high_overlap')!;
    expect(overlap.severity).toBe('info');
  });

  it('ignores cash-like lines when judging single-stock concentration', () => {
    const funds = [mk(1, [['Net Receivables', 30], ['Repo', 20], ['HDFC', 5]])];
    const insights = computeInvestmentInsights({ funds });
    expect(insights.map((i) => i.kind)).not.toContain('stock_concentration');
  });

  it('flags a real single-stock concentration with rupee impact', () => {
    const funds = [mk(1, [['HDFC', 30]])];
    const c = computeInvestmentInsights({ funds }).find((i) => i.kind === 'stock_concentration')!;
    expect(c.detail).toContain('₹');
  });

  it('is silent about goals without a profile', () => {
    const insights = computeInvestmentInsights({ funds: [mk(1, [['HDFC', 5]])] });
    expect(insights.map((i) => i.kind)).not.toContain('goal_drift');
  });
});
