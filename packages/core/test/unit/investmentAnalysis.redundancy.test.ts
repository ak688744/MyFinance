import { describe, it, expect } from 'vitest';
import { detectRedundancy } from '../../src/domain/investmentAnalysis/redundancy';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const mk = (id: number, cat: 'equity' | 'debt', hs: [string, number][]): OwnedFund => ({
  schemeId: id, schemeName: `F${id}`, category: cat, currentValueInr: 100, planType: null,
  expenseRatioDirect: null, expenseRatioRegular: null,
  holdings: hs.map(([n, w]) => ({ securityName: n, isin: null, weightPct: w, sector: null, marketCapBucket: null })),
});

describe('detectRedundancy', () => {
  it('flags high-overlap pairs and overcrowded categories', () => {
    const funds = [
      mk(1, 'equity', [['HDFC', 60], ['ICICI', 20]]),
      mk(2, 'equity', [['HDFC', 55], ['TCS', 25]]),
      mk(3, 'equity', [['INFY', 30], ['WIPRO', 20]]),
    ];
    const r = detectRedundancy(funds);
    expect(r.highOverlapPairs.length).toBeGreaterThan(0);
    expect(r.overCrowdedCategories).toContainEqual({ category: 'equity', count: 3 });
  });
});
