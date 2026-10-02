import type { OwnedFund } from './types';

export type GoalFitProfile = {
  horizonYears: number;
  riskTolerance: 'low' | 'medium' | 'high';
};

export type GoalFitResult = {
  mismatches: { schemeId: number; schemeName: string; reason: string }[];
  summary: string;
};

// horizon < 3y → equity funds flagged
// riskTolerance low + equity fund → flagged
// horizon >= 7y + all debt → under-allocation flag

export function checkGoalFit(
  funds: OwnedFund[],
  profile: GoalFitProfile,
): GoalFitResult {
  const mismatches: GoalFitResult['mismatches'] = [];

  for (const f of funds) {
    if (profile.horizonYears < 3 && f.category === 'equity') {
      mismatches.push({
        schemeId: f.schemeId,
        schemeName: f.schemeName,
        reason: 'Equity held for a short horizon',
      });
    }
    if (profile.riskTolerance === 'low' && f.category === 'equity') {
      mismatches.push({
        schemeId: f.schemeId,
        schemeName: f.schemeName,
        reason: 'Equity exposure with low risk tolerance',
      });
    }
  }

  if (profile.horizonYears >= 7) {
    const hasEquity = funds.some((f) => f.category === 'equity' || f.category === 'hybrid');
    const allDebt = funds.length > 0 && funds.every((f) => f.category === 'debt');
    if (!hasEquity && allDebt) {
      for (const f of funds) {
        mismatches.push({
          schemeId: f.schemeId,
          schemeName: f.schemeName,
          reason: 'Debt-only allocation for a long horizon',
        });
      }
    }
  }

  const summary = mismatches.length === 0
    ? 'Portfolio aligns with stated horizon and risk profile'
    : `${mismatches.length} holding(s) may not fit your stated goals`;

  return { mismatches, summary };
}
