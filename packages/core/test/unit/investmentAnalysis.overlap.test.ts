import { describe, it, expect } from 'vitest';
import { fundOverlap } from '../../src/domain/investmentAnalysis/overlap';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const mk = (id: number, hs: [string, number][]): OwnedFund => ({
  schemeId: id, schemeName: `F${id}`, category: 'equity', currentValueInr: 100, planType: null,
  expenseRatioDirect: null, expenseRatioRegular: null,
  holdings: hs.map(([n, w]) => ({ securityName: n, isin: null, weightPct: w, sector: null, marketCapBucket: null })),
});

describe('fundOverlap', () => {
  it('sums min weight over common securities', () => {
    const a = mk(1, [['HDFC', 10], ['ICICI', 8], ['TCS', 5]]);
    const b = mk(2, [['HDFC', 6], ['ICICI', 12], ['INFY', 7]]);
    const r = fundOverlap(a, b);
    expect(r.overlapPct).toBeCloseTo(14, 5);
    expect(r.commonSecurities.map((c) => c.name).sort()).toEqual(['HDFC', 'ICICI']);
  });
  it('returns 0 when disjoint', () => {
    expect(fundOverlap(mk(1, [['A', 5]]), mk(2, [['B', 5]])).overlapPct).toBe(0);
  });
});
