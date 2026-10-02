import { describe, it, expect } from 'vitest';
import { checkGoalFit } from '../../src/domain/investmentAnalysis/goalFit';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const equityFund: OwnedFund = {
  schemeId: 1, schemeName: 'Equity Fund', category: 'equity', currentValueInr: 100,
  planType: null, expenseRatioDirect: null, expenseRatioRegular: null, holdings: [],
};

describe('checkGoalFit', () => {
  it('flags equity for short horizon', () => {
    const r = checkGoalFit([equityFund], { horizonYears: 2, riskTolerance: 'medium' });
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0].reason).toMatch(/short horizon/i);
  });
  it('returns no mismatches when profile fits', () => {
    const r = checkGoalFit([equityFund], { horizonYears: 10, riskTolerance: 'high' });
    expect(r.mismatches).toHaveLength(0);
  });
});
