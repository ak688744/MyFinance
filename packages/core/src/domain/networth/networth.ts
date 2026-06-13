import { formatDate, parseDate as parseLocal } from '../xirr';
import { getHoldings } from '../portfolio';
import { valueAsset, valueComputedAsset, valueManualAsset } from '../valuation';
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
  NetWorthPoint,
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

export type NetWorthHistoryDeps = NetWorthDeps & {
  /** MF portfolio value as of a past date. Stretch: API wires via getNAVForDate. */
  mfValueAt?: (date: string) => Promise<number>;
};

/**
 * Derive-on-read net worth at each requested sample date. Computed assets are
 * compounded to `d`; manual assets use the latest valuation with valued_at <= d;
 * liabilities use outstanding at `d`. MF uses the injected mfValueAt (stretch;
 * defaults to 0 when not provided).
 */
export async function getNetWorthHistory(
  deps: NetWorthHistoryDeps,
  params: { dates: string[] },
  _today: Date = new Date(),
): Promise<NetWorthPoint[]> {
  const assets = deps.assetRepo.list({ status: 'active' });
  const loans = deps.liabilityRepo.list({ status: 'active' });

  // Preload child rows once.
  const childById = new Map<number, {
    contributions: ReturnType<AssetContributionRepo['listByAsset']>;
    rates: ReturnType<AssetRateRepo['listByAsset']>;
    valuations: ReturnType<AssetValuationRepo['listByAsset']>;
  }>();
  for (const a of assets) {
    childById.set(a.id, {
      contributions: deps.contributionRepo.listByAsset(a.id),
      rates: deps.rateRepo.listByAsset(a.id),
      valuations: deps.valuationRepo.listByAsset(a.id),
    });
  }

  const points: NetWorthPoint[] = [];
  for (const dateStr of params.dates) {
    const asOf = parseLocal(dateStr);
    let totalAssets = 0;

    if (deps.mfValueAt) totalAssets += await deps.mfValueAt(dateStr);

    for (const a of assets) {
      const inputs = childById.get(a.id)!;
      if (a.valuationStrategy === 'computed') {
        totalAssets += valueComputedAsset(a, inputs.contributions, inputs.rates, asOf).currentValue;
      } else {
        // manual: latest valuation with valued_at <= dateStr
        const eligible = inputs.valuations.filter((v) => v.valuedAt <= dateStr);
        totalAssets += valueManualAsset(a, eligible, asOf).currentValue;
      }
    }

    const totalLiabilities = loans.reduce(
      (s, l) => s + loanStatus(l, asOf).outstanding,
      0,
    );

    points.push({
      date: dateStr,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    });
  }
  return points;
}
