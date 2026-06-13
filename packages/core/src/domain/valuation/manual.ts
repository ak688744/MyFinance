import { parseDate, yearsBetween, formatDate } from '../xirr';
import type { Asset, AssetValuation, ValuedAsset } from '../../types';

/**
 * Value a `manual` asset (gold / real estate / cash): take the latest
 * user-stated valuation by valued_at. invested/returns are null (no cost
 * basis). ageDays drives the "Updated N days ago" freshness chip.
 */
export function valueManualAsset(
  asset: Asset,
  valuations: AssetValuation[],
  today: Date = new Date(),
): ValuedAsset {
  const todayStr = formatDate(today);
  const base: ValuedAsset = {
    assetId: asset.id,
    assetClass: asset.assetClass,
    accountId: asset.accountId,
    name: asset.name,
    valuationStrategy: 'manual',
    currentValue: 0,
    invested: null,
    returns: null,
    asOf: todayStr,
  };

  if (valuations.length === 0) return base;

  const latest = [...valuations].sort((a, b) =>
    b.valuedAt.localeCompare(a.valuedAt),
  )[0];

  const ageDays = Math.round(
    yearsBetween(parseDate(latest.valuedAt), today) * 365,
  );

  return {
    ...base,
    currentValue: latest.value,
    valuedAt: latest.valuedAt,
    ageDays,
  };
}
