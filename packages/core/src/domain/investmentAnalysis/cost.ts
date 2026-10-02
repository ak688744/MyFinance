import type { OwnedFund } from './types';

export type CostResult = {
  weightedExpenseRatio: number;
  annualCostInr: number;
  regularPlanFunds: {
    schemeId: number;
    schemeName: string;
    gapPct: number;
    annualExtraInr: number;
  }[];
};

export function portfolioCost(funds: OwnedFund[]): CostResult {
  const totalValue = funds.reduce((sum, f) => sum + f.currentValueInr, 0);
  let weightedSum = 0;
  const regularPlanFunds: CostResult['regularPlanFunds'] = [];

  for (const f of funds) {
    const er = f.planType === 'regular'
      ? f.expenseRatioRegular
      : f.planType === 'direct'
        ? f.expenseRatioDirect
        : f.expenseRatioRegular ?? f.expenseRatioDirect;

    if (er != null) weightedSum += f.currentValueInr * er;

    if (
      f.planType === 'regular'
      && f.expenseRatioRegular != null
      && f.expenseRatioDirect != null
    ) {
      const gapPct = f.expenseRatioRegular - f.expenseRatioDirect;
      if (gapPct > 0) {
        regularPlanFunds.push({
          schemeId: f.schemeId,
          schemeName: f.schemeName,
          gapPct,
          annualExtraInr: f.currentValueInr * (gapPct / 100),
        });
      }
    }
  }

  const weightedExpenseRatio = totalValue > 0 ? weightedSum / totalValue : 0;
  return {
    weightedExpenseRatio,
    annualCostInr: totalValue > 0 ? (weightedExpenseRatio / 100) * totalValue : 0,
    regularPlanFunds,
  };
}
