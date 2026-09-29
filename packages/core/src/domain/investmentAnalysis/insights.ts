import type { OwnedFund } from './types';
import { overlapMatrix } from './overlap';
import { portfolioConcentration } from './concentration';
import { portfolioCost } from './cost';
import { detectRedundancy } from './redundancy';
import { checkGoalFit } from './goalFit';
import { inferSubCategory } from './subCategory';
import { inferPortfolioProfile } from './profile';

export type InvestmentInsight = {
  id: string;
  kind: 'high_overlap' | 'stock_concentration' | 'cost_leak' | 'over_diversification' | 'portfolio_profile' | 'goal_drift' | 'stale_data';
  severity: 'info' | 'warn';
  title: string;
  detail: string;
  schemeIds: number[];
};

export const HIGH_OVERLAP_THRESHOLD_PCT = 50;
export const SINGLE_STOCK_CONCENTRATION_PCT = 10;
export const COST_LEAK_MIN_INR = 500;
/** Overlap is a warning only when the duplicated money is at least this share of the portfolio. */
export const OVERLAP_WARN_MIN_PORTFOLIO_PCT = 5;
export const OVER_DIVERSIFICATION_CATEGORY_MIN = 3;

export type InvestmentInsightInput = {
  funds: OwnedFund[];
  profile?: { horizonYears: number; riskTolerance: 'low' | 'medium' | 'high' } | null;
};

export function computeInvestmentInsights(input: InvestmentInsightInput): InvestmentInsight[] {
  const insights: InvestmentInsight[] = [];
  const { funds, profile } = input;
  const totalValue = funds.reduce((sum, f) => sum + f.currentValueInr, 0);
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const inferred = inferPortfolioProfile(funds);
  if (inferred) {
    const parts = [`${inferred.equityPct.toFixed(0)}% equity across ${inferred.equityFundCount} fund${inferred.equityFundCount === 1 ? '' : 's'}`];
    if (inferred.smallMidPctOfEquity >= 1) parts.push(`about ${inferred.smallMidPctOfEquity.toFixed(0)}% of your equity in dedicated small- and mid-cap funds`);
    if (inferred.nonEquityPct >= 1) parts.push(`${inferred.nonEquityPct.toFixed(0)}% debt/other`);
    insights.push({
      id: 'profile:inferred',
      kind: 'portfolio_profile',
      severity: 'info',
      title: `Your portfolio looks ${inferred.label}`,
      detail: `Inferred from your holdings, not from stated goals: ${parts.join(', ')}. If that doesn't match your horizon or risk comfort, tell me and I'll check fit.`,
      schemeIds: funds.map((f) => f.schemeId),
    });
  }

  const pairs = overlapMatrix(funds).filter((p) => p.overlapPct > HIGH_OVERLAP_THRESHOLD_PCT);
  for (const p of pairs) {
    const a = funds.find((f) => f.schemeId === p.schemeIdA);
    const b = funds.find((f) => f.schemeId === p.schemeIdB);
    const subA = a ? inferSubCategory(a.schemeName) : null;
    const subB = b ? inferSubCategory(b.schemeName) : null;
    // Same sub-category pairs are reported once, as a group, below.
    if (subA && subB && subA.key === subB.key) continue;
    const duplicatedInr = a && b ? (p.overlapPct / 100) * Math.min(a.currentValueInr, b.currentValueInr) : 0;
    const portfolioPct = totalValue > 0 ? (duplicatedInr / totalValue) * 100 : 0;
    insights.push({
      id: `overlap:${p.schemeIdA}:${p.schemeIdB}`,
      kind: 'high_overlap',
      severity: portfolioPct >= OVERLAP_WARN_MIN_PORTFOLIO_PCT ? 'warn' : 'info',
      title: `High overlap: ${a?.schemeName ?? p.schemeIdA} & ${b?.schemeName ?? p.schemeIdB}`,
      detail: `These funds share ${p.overlapPct.toFixed(1)}% of their holdings — about ${inr(duplicatedInr)} (${portfolioPct.toFixed(1)}% of your portfolio) is effectively the same stocks held twice.`,
      schemeIds: [p.schemeIdA, p.schemeIdB],
    });
  }

  const concentration = portfolioConcentration(funds);
  const top = concentration.topSecurities[0];
  if (top && top.pct > SINGLE_STOCK_CONCENTRATION_PCT) {
    insights.push({
      id: `concentration:${top.key}`,
      kind: 'stock_concentration',
      severity: 'warn',
      title: `Concentration in ${top.key}`,
      detail: `${top.key} represents ${top.pct.toFixed(1)}% of your portfolio (about ${inr((top.pct / 100) * totalValue)}) across all funds.`,
      schemeIds: funds.map((f) => f.schemeId),
    });
  }

  const cost = portfolioCost(funds);
  for (const r of cost.regularPlanFunds) {
    if (r.annualExtraInr >= COST_LEAK_MIN_INR) {
      insights.push({
        id: `cost:${r.schemeId}`,
        kind: 'cost_leak',
        severity: 'warn',
        title: `Regular plan cost leak: ${r.schemeName}`,
        detail: `Switching to direct could save ~₹${Math.round(r.annualExtraInr).toLocaleString('en-IN')}/year (${r.gapPct.toFixed(2)}% gap).`,
        schemeIds: [r.schemeId],
      });
    }
  }

  const redundancy = detectRedundancy(funds, {
    overlapThresholdPct: HIGH_OVERLAP_THRESHOLD_PCT,
    sameCategoryMin: OVER_DIVERSIFICATION_CATEGORY_MIN,
  });
  for (const g of redundancy.redundantGroups) {
    const names = g.schemeIds.map((id) => funds.find((f) => f.schemeId === id)?.schemeName ?? String(id));
    const portfolioPct = totalValue > 0 ? (g.duplicatedInr / totalValue) * 100 : 0;
    insights.push({
      id: `over-diversification:${g.subCategory}`,
      kind: 'over_diversification',
      severity: portfolioPct >= OVERLAP_WARN_MIN_PORTFOLIO_PCT ? 'warn' : 'info',
      title: `${g.schemeIds.length} ${g.subCategoryLabel} funds hold largely the same stocks`,
      detail: `${names.join(', ')} overlap by up to ${g.maxOverlapPct.toFixed(1)}%. Holding both adds little diversification — about ${inr(g.duplicatedInr)} (${portfolioPct.toFixed(1)}% of your portfolio) is duplicated.`,
      schemeIds: g.schemeIds,
    });
  }

  if (profile) {
    const goalFit = checkGoalFit(funds, profile);
    for (const m of goalFit.mismatches) {
      insights.push({
        id: `goal:${m.schemeId}`,
        kind: 'goal_drift',
        severity: 'warn',
        title: `Goal mismatch: ${m.schemeName}`,
        detail: m.reason,
        schemeIds: [m.schemeId],
      });
    }
  }

  return insights;
}
