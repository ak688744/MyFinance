import type { OwnedFund } from './types';

export type LookthroughBucket = { key: string; valueInr: number; pct: number };

export type LookthroughResult = {
  bySector: LookthroughBucket[];
  byMarketCap: LookthroughBucket[];
  bySecurity: LookthroughBucket[];
  totalValueInr: number;
};

function aggregateBuckets(
  entries: { key: string; valueInr: number }[],
  totalValueInr: number,
): LookthroughBucket[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.key, (map.get(e.key) ?? 0) + e.valueInr);
  }
  return [...map.entries()]
    .map(([key, valueInr]) => ({
      key,
      valueInr,
      pct: totalValueInr > 0 ? (valueInr / totalValueInr) * 100 : 0,
    }))
    .sort((a, b) => b.valueInr - a.valueInr);
}

export function portfolioLookthrough(funds: OwnedFund[]): LookthroughResult {
  const totalValueInr = funds.reduce((sum, f) => sum + f.currentValueInr, 0);
  const bySectorEntries: { key: string; valueInr: number }[] = [];
  const byMarketCapEntries: { key: string; valueInr: number }[] = [];
  const bySecurityEntries: { key: string; valueInr: number }[] = [];

  for (const fund of funds) {
    for (const h of fund.holdings) {
      const contribution = fund.currentValueInr * (h.weightPct / 100);
      const sectorKey = h.sector ?? 'Unknown';
      const capKey = h.marketCapBucket ?? 'other';
      const securityKey = h.isin ?? h.securityName;
      bySectorEntries.push({ key: sectorKey, valueInr: contribution });
      byMarketCapEntries.push({ key: capKey, valueInr: contribution });
      bySecurityEntries.push({ key: securityKey, valueInr: contribution });
    }
  }

  return {
    totalValueInr,
    bySector: aggregateBuckets(bySectorEntries, totalValueInr),
    byMarketCap: aggregateBuckets(byMarketCapEntries, totalValueInr),
    bySecurity: aggregateBuckets(bySecurityEntries, totalValueInr),
  };
}
