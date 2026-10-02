import { describe, it, expect } from 'vitest';
import { portfolioLookthrough } from '../../src/domain/investmentAnalysis/lookthrough';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const f = (id: number, val: number, hs: [string, number, string][]): OwnedFund => ({
  schemeId: id, schemeName: `F${id}`, category: 'equity', currentValueInr: val, planType: null,
  expenseRatioDirect: null, expenseRatioRegular: null,
  holdings: hs.map(([n, w, s]) => ({ securityName: n, isin: n, weightPct: w, sector: s, marketCapBucket: 'large' as const })),
});

describe('portfolioLookthrough', () => {
  it('aggregates cross-fund security exposure by value', () => {
    const funds = [f(1, 1000, [['HDFC', 10, 'Fin']]), f(2, 3000, [['HDFC', 20, 'Fin']])];
    const r = portfolioLookthrough(funds);
    expect(r.totalValueInr).toBe(4000);
    const hdfc = r.bySecurity.find((s) => s.key === 'HDFC')!;
    expect(hdfc.valueInr).toBeCloseTo(700, 5);
    expect(hdfc.pct).toBeCloseTo(17.5, 5);
    expect(r.bySector[0].key).toBe('Fin');
  });

  it('handles an empty portfolio without throwing', () => {
    const r = portfolioLookthrough([]);
    expect(r.totalValueInr).toBe(0);
    expect(r.bySector).toEqual([]);
    expect(r.byMarketCap).toEqual([]);
    expect(r.bySecurity).toEqual([]);
  });

  it('does not divide-by-zero when all funds have zero value', () => {
    const r = portfolioLookthrough([f(1, 0, [['HDFC', 10, 'Fin']])]);
    expect(r.totalValueInr).toBe(0);
    expect(r.bySecurity[0].pct).toBe(0); // not NaN
    expect(Number.isNaN(r.bySecurity[0].valueInr)).toBe(false);
  });

  it('buckets null sector/market-cap under Unknown/other', () => {
    const fund: OwnedFund = {
      schemeId: 9, schemeName: 'F9', category: 'equity', currentValueInr: 1000, planType: null,
      expenseRatioDirect: null, expenseRatioRegular: null,
      holdings: [{ securityName: 'X', isin: 'X', weightPct: 50, sector: null, marketCapBucket: null }],
    };
    const r = portfolioLookthrough([fund]);
    expect(r.bySector[0].key).toBe('Unknown');
    expect(r.byMarketCap[0].key).toBe('other');
  });
});
