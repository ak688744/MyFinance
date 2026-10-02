import type { OwnedFund } from './types';
import { inferSubCategory } from './subCategory';

export type InferredProfile = {
  label: string;
  equityPct: number;
  /** Share of equity value held in dedicated small-cap and mid-cap funds. */
  smallMidPctOfEquity: number;
  nonEquityPct: number;
  equityFundCount: number;
  totalValueInr: number;
};

export const GROWTH_EQUITY_MIN_PCT = 75;
export const BALANCED_EQUITY_MIN_PCT = 40;
export const AGGRESSIVE_SMALL_MID_MIN_PCT = 35;

/**
 * Describes what the portfolio itself looks like. This is inferred from holdings,
 * never from stated goals, so callers must label it as an inference.
 */
export function inferPortfolioProfile(funds: OwnedFund[]): InferredProfile | null {
  const totalValueInr = funds.reduce((s, f) => s + f.currentValueInr, 0);
  if (totalValueInr <= 0) return null;

  const equityFunds = funds.filter((f) => f.category === 'equity');
  const equityValue = equityFunds.reduce((s, f) => s + f.currentValueInr, 0);
  const equityPct = (equityValue / totalValueInr) * 100;

  // Fund-level, from sub-category: source data has no reliable per-stock market-cap.
  const smallMidValue = equityFunds
    .filter((f) => {
      const key = inferSubCategory(f.schemeName)?.key;
      return key === 'small_cap' || key === 'mid_cap';
    })
    .reduce((s, f) => s + f.currentValueInr, 0);
  const smallMidPctOfEquity = equityValue > 0 ? (smallMidValue / equityValue) * 100 : 0;

  let label: string;
  if (equityPct >= GROWTH_EQUITY_MIN_PCT) {
    label = smallMidPctOfEquity >= AGGRESSIVE_SMALL_MID_MIN_PCT
      ? 'aggressive, long-horizon growth'
      : 'growth-oriented, long-horizon';
  } else if (equityPct >= BALANCED_EQUITY_MIN_PCT) {
    label = 'balanced';
  } else {
    label = 'conservative, capital-preserving';
  }

  return {
    label,
    equityPct,
    smallMidPctOfEquity,
    nonEquityPct: 100 - equityPct,
    equityFundCount: equityFunds.length,
    totalValueInr,
  };
}
