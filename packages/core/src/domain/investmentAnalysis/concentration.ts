import type { OwnedFund } from './types';
import { portfolioLookthrough } from './lookthrough';

/** Cash-like portfolio lines that are not real single-stock exposure. */
const CASH_LIKE = /^(net receivables|net current assets|receivables|cash|cblo|cbls|treps?|tri-?party|repo|reverse repo|call money|margin|treasury bills?|t-?bills?|others?)\b/i;

export function isCashLike(name: string): boolean {
  return CASH_LIKE.test(name.trim());
}

export type ConcentrationResult = {
  topSecurities: { key: string; pct: number }[];
  singleStockMaxPct: number;
  topSectorPct: number;
  hhi: number;
};

export function portfolioConcentration(funds: OwnedFund[]): ConcentrationResult {
  const lookthrough = portfolioLookthrough(funds);
  const topSecurities = lookthrough.bySecurity.filter((s) => !isCashLike(s.key)).map((s) => ({ key: s.key, pct: s.pct }));
  const singleStockMaxPct = topSecurities.length > 0 ? topSecurities[0].pct : 0;
  const topSectorPct = lookthrough.bySector.length > 0 ? lookthrough.bySector[0].pct : 0;

  let hhi = 0;
  for (const s of lookthrough.bySecurity) {
    const fraction = s.pct / 100;
    hhi += fraction * fraction;
  }

  return {
    topSecurities: topSecurities.slice(0, 10),
    singleStockMaxPct,
    topSectorPct,
    hhi,
  };
}
