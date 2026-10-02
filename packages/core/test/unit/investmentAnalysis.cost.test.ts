import { describe, it, expect } from 'vitest';
import { portfolioCost } from '../../src/domain/investmentAnalysis/cost';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

describe('portfolioCost', () => {
  it('computes weighted expense ratio and regular-plan gap', () => {
    const funds: OwnedFund[] = [{
      schemeId: 1,
      schemeName: 'Regular Fund',
      category: 'equity',
      currentValueInr: 100000,
      planType: 'regular',
      expenseRatioDirect: 0.4,
      expenseRatioRegular: 1.4,
      holdings: [],
    }];
    const r = portfolioCost(funds);
    expect(r.weightedExpenseRatio).toBe(1.4);
    expect(r.annualCostInr).toBeCloseTo(1400, 5);
    expect(r.regularPlanFunds[0].annualExtraInr).toBeCloseTo(1000, 5);
  });

  it('returns zeros for an empty portfolio (no divide-by-zero)', () => {
    const r = portfolioCost([]);
    expect(r.weightedExpenseRatio).toBe(0);
    expect(r.annualCostInr).toBe(0);
    expect(r.regularPlanFunds).toEqual([]);
  });

  it('does not flag a direct-plan fund as a cost leak', () => {
    const funds: OwnedFund[] = [{
      schemeId: 2, schemeName: 'Direct Fund', category: 'equity', currentValueInr: 100000,
      planType: 'direct', expenseRatioDirect: 0.4, expenseRatioRegular: 1.4, holdings: [],
    }];
    const r = portfolioCost(funds);
    expect(r.weightedExpenseRatio).toBe(0.4);
    expect(r.regularPlanFunds).toEqual([]);
  });
});
