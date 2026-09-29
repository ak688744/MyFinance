import type { FetchedFundData } from '../../types';

type FundamentalKey = keyof FetchedFundData['fundamentals'];

const FUNDAMENTAL_KEYS: FundamentalKey[] = [
  'expenseRatioDirect', 'expenseRatioRegular', 'planType', 'aum', 'benchmarkName',
  'stdDev', 'sharpe', 'beta', 'alpha', 'source',
];

function firstNonNull<T>(values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v != null) return v;
  }
  return null;
}

/** Merge fetched fund data: primary holdings, first-non-null fundamentals. */
export function mergeFundData(primary: FetchedFundData, ...others: FetchedFundData[]): FetchedFundData {
  const all = [primary, ...others];
  const holdingsSource = all.find((d) => d.holdings.length > 0) ?? primary;

  const fundamentals = { ...primary.fundamentals };
  for (const key of FUNDAMENTAL_KEYS) {
    if (key === 'source') continue;
    (fundamentals as Record<string, unknown>)[key] = firstNonNull(
      all.map((d) => d.fundamentals[key]),
    );
  }
  fundamentals.source = holdingsSource.fundamentals.source;

  return {
    source: holdingsSource.source,
    asOfDate: holdingsSource.asOfDate,
    fundamentals,
    holdings: holdingsSource.holdings,
  };
}
