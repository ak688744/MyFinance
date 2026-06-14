import { parseDate, yearsBetween, formatDate } from '../xirr';
import type {
  Asset,
  AssetContribution,
  AssetRate,
  CompoundingFrequency,
  ValuedAsset,
} from '../../types';

const FREQ_PER_YEAR: Record<CompoundingFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};

/**
 * Compound a single contribution of `amount` from `fromDate` to `toDate`,
 * switching the annual rate at each asset_rate period boundary. `rates` need
 * not be pre-sorted. `n` = compounding periods per year.
 *
 * For a sub-interval of `t` years at annual rate `r%`:
 *   factor = (1 + r/100/n)^(n·t)
 * Dates before the earliest effective_from use the earliest rate.
 */
export function compoundContribution(
  amount: number,
  fromDate: string,
  toDate: string,
  rates: AssetRate[],
  n: number,
): number {
  if (rates.length === 0) return amount;
  if (toDate <= fromDate) return amount;

  const sorted = [...rates].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  // Build breakpoints strictly inside (fromDate, toDate) where the rate changes.
  const breaks: string[] = [fromDate];
  for (const r of sorted) {
    if (r.effectiveFrom > fromDate && r.effectiveFrom < toDate) {
      breaks.push(r.effectiveFrom);
    }
  }
  breaks.push(toDate);

  // rateAt(date): the rate whose effective_from is the latest <= date; if none,
  // the earliest rate.
  const rateAt = (date: string): number => {
    let chosen = sorted[0].rate;
    for (const r of sorted) {
      if (r.effectiveFrom <= date) chosen = r.rate;
      else break;
    }
    return chosen;
  };

  let value = amount;
  for (let i = 0; i < breaks.length - 1; i++) {
    const segStart = breaks[i];
    const segEnd = breaks[i + 1];
    const t = yearsBetween(parseDate(segStart), parseDate(segEnd));
    if (t <= 0) continue;
    const r = rateAt(segStart);
    value *= Math.pow(1 + r / 100 / n, n * t);
  }
  return value;
}

/**
 * Value a `computed` asset (FD / PPF / EPF / NPS):
 *   invested     = Σ contribution amounts
 *   currentValue = Σ each contribution compounded to the effective end date
 *   returns      = currentValue − invested
 *
 * FD cumulative respects params.maturityDate: growth stops at maturity (the
 * effective end is min(today, maturityDate)).
 */
export function valueComputedAsset(
  asset: Asset,
  contributions: AssetContribution[],
  rates: AssetRate[],
  today: Date = new Date(),
): ValuedAsset {
  const n = FREQ_PER_YEAR[asset.params?.compounding ?? 'yearly'];
  const todayStr = formatDate(today);

  const maturity = asset.params?.maturityDate;
  const effectiveEnd =
    maturity && asset.params?.payout !== 'periodic' && todayStr > maturity
      ? maturity
      : todayStr;

  let invested = 0;
  let currentValue = 0;
  for (const c of contributions) {
    invested += c.amount;
    currentValue += compoundContribution(
      c.amount,
      c.contributionDate,
      effectiveEnd,
      rates,
      n,
    );
  }

  return {
    assetId: asset.id,
    assetClass: asset.assetClass,
    accountId: asset.accountId,
    name: asset.name,
    valuationStrategy: 'computed',
    currentValue,
    invested,
    returns: currentValue - invested,
    asOf: todayStr,
  };
}
