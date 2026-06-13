import { formatDate } from '../xirr';
import { getHoldings } from '../portfolio';
import { valueAsset } from '../valuation';
import { loanStatus } from '../loans/amortization';
import type {
  InvestmentTxRepo,
  AssetRepo,
  AssetContributionRepo,
  AssetRateRepo,
  AssetValuationRepo,
  LiabilityRepo,
} from '../../repositories/types';
import type {
  Holding,
  NavLookup,
  ValuedAsset,
  NetWorthSummary,
  NetWorthClassBreakdown,
} from '../../types';

export type NetWorthDeps = {
  assetRepo: AssetRepo;
  contributionRepo: AssetContributionRepo;
  rateRepo: AssetRateRepo;
  valuationRepo: AssetValuationRepo;
  liabilityRepo: LiabilityRepo;
  /**
   * MF holdings source. Defaults to the existing (untouched) portfolio path.
   * Injected so the rollup is testable offline and the MF pipeline stays
   * unchanged. When wired in the API, pass:
   *   (filters) => getHoldings({ txRepo, nav }, filters, today)
   */
  getMfHoldings: (filters: { account?: string }) => Promise<Holding[]>;
};

export type NetWorthFilters = { account?: number };

function mfToValuedAsset(h: Holding): ValuedAsset {
  return {
    assetId: null,
    assetClass: 'mutual_fund',
    accountId: null,
    name: h.schemeName,
    valuationStrategy: 'market',
    currentValue: h.currentValue,
    invested: h.investedValue,
    returns: h.returnsAmount,
    asOf: h.asOfDate,
  };
}

/**
 * Unified projection: MF holdings (existing pipeline, projected to ValuedAsset)
 * unioned with generic computed/manual assets. Single logical "global assets"
 * surface. When `account` filter is set it scopes the generic assets by
 * account_id; MF holdings are returned unfiltered by account here (the API maps
 * the account filter for MF separately if needed).
 */
export async function getAllAssets(
  deps: NetWorthDeps,
  filters: NetWorthFilters = {},
  today: Date = new Date(),
): Promise<ValuedAsset[]> {
  const result: ValuedAsset[] = [];

  // MF (Family 1) — only when no account filter, or always (current value live).
  const mf = await deps.getMfHoldings({});
  for (const h of mf) result.push(mfToValuedAsset(h));

  // Family 2/3 — generic assets.
  const assets = deps.assetRepo.list({
    status: 'active',
    ...(filters.account !== undefined ? { account: filters.account } : {}),
  });
  for (const asset of assets) {
    const valued = valueAsset(
      asset,
      {
        contributions: deps.contributionRepo.listByAsset(asset.id),
        rates: deps.rateRepo.listByAsset(asset.id),
        valuations: deps.valuationRepo.listByAsset(asset.id),
      },
      today,
    );
    result.push(valued);
  }

  return result;
}

export async function getNetWorth(
  deps: NetWorthDeps,
  filters: NetWorthFilters = {},
  today: Date = new Date(),
): Promise<NetWorthSummary> {
  const assets = await getAllAssets(deps, filters, today);
  const totalAssets = assets.reduce((s, a) => s + a.currentValue, 0);

  const loans = deps.liabilityRepo.list({ status: 'active' });
  const totalLiabilities = loans.reduce(
    (s, l) => s + loanStatus(l, today).outstanding,
    0,
  );

  // Per-class breakdown.
  const byClass = new Map<string, { value: number; count: number }>();
  for (const a of assets) {
    const e = byClass.get(a.assetClass) ?? { value: 0, count: 0 };
    e.value += a.currentValue;
    e.count += 1;
    byClass.set(a.assetClass, e);
  }
  const byAssetClass: NetWorthClassBreakdown[] = Array.from(byClass.entries())
    .map(([assetClass, { value, count }]) => ({
      assetClass,
      value,
      percentage: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
      count,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    byAssetClass,
  };
}
