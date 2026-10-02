import { describe, it, expect } from 'vitest';
import { portfolioConcentration } from '../../src/domain/investmentAnalysis/concentration';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const f = (id: number, val: number, hs: [string, number][]): OwnedFund => ({
  schemeId: id, schemeName: `F${id}`, category: 'equity', currentValueInr: val, planType: null,
  expenseRatioDirect: null, expenseRatioRegular: null,
  holdings: hs.map(([n, w]) => ({ securityName: n, isin: n, weightPct: w, sector: null, marketCapBucket: null })),
});

describe('portfolioConcentration', () => {
  it('computes HHI for a 50/50 two-stock portfolio', () => {
    const funds = [f(1, 1000, [['A', 50], ['B', 50]])];
    const r = portfolioConcentration(funds);
    expect(r.hhi).toBeCloseTo(0.5, 5);
    expect(r.singleStockMaxPct).toBeCloseTo(50, 5);
  });

  it('returns zeros for an empty portfolio (no throw / no NaN)', () => {
    const r = portfolioConcentration([]);
    expect(r.hhi).toBe(0);
    expect(r.singleStockMaxPct).toBe(0);
    expect(r.topSectorPct).toBe(0);
    expect(r.topSecurities).toEqual([]);
  });

  it('HHI of a single-stock fund approaches 1', () => {
    const r = portfolioConcentration([f(1, 1000, [['A', 100]])]);
    expect(r.hhi).toBeCloseTo(1, 5);
    expect(r.singleStockMaxPct).toBeCloseTo(100, 5);
  });
});
