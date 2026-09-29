import type { FetchedFundData, FundDataSource } from '../../types';
import type { SchemeFundamentalsRepo, SchemeHoldingsRepo, SchemeRepo } from '../../repositories/types';
import type { FundDataAdapter } from './types';
import { mergeFundData } from './merge';

export type IngestFundDataDeps = {
  schemeRepo: SchemeRepo;
  fundamentalsRepo: SchemeFundamentalsRepo;
  holdingsRepo: SchemeHoldingsRepo;
  adapters: { source: FundDataSource; fetch: FundDataAdapter }[];
  runInTransaction: <T>(fn: () => T) => T;
  retentionCap?: number;
};

export async function ingestFundData(
  deps: IngestFundDataDeps,
  amfiCode: string,
  opts: { source?: FundDataSource } = {},
): Promise<{ schemeId: number; source: string; asOfDate: string; holdingsCount: number }> {
  const scheme = deps.schemeRepo.getByAmfiCode(amfiCode);
  if (!scheme) throw new Error(`No scheme found for AMFI code: ${amfiCode}`);

  // Honor an explicit source selection; otherwise try all adapters (Groww primary).
  const adapters = opts.source
    ? deps.adapters.filter((a) => a.source === opts.source)
    : deps.adapters;
  if (adapters.length === 0) {
    throw new Error(`No fund-data adapter registered for source: ${opts.source}`);
  }

  const ctx = { isin: scheme.isin, schemeName: scheme.schemeName };
  const settled = await Promise.allSettled(
    adapters.map((a) => a.fetch(amfiCode, ctx)),
  );

  const fulfilled: FetchedFundData[] = [];
  const rejections: unknown[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
    else rejections.push(r.reason);
  }

  if (fulfilled.length === 0) {
    const first = rejections[0];
    throw first instanceof Error ? first : new Error(String(first));
  }

  const merged = mergeFundData(fulfilled[0], ...fulfilled.slice(1));
  const retentionCap = deps.retentionCap ?? 12;

  deps.runInTransaction(() => {
    deps.fundamentalsRepo.upsert({
      schemeId: scheme.id,
      expenseRatioDirect: merged.fundamentals.expenseRatioDirect,
      expenseRatioRegular: merged.fundamentals.expenseRatioRegular,
      planType: merged.fundamentals.planType,
      aum: merged.fundamentals.aum,
      benchmarkName: merged.fundamentals.benchmarkName,
      stdDev: merged.fundamentals.stdDev,
      sharpe: merged.fundamentals.sharpe,
      beta: merged.fundamentals.beta,
      alpha: merged.fundamentals.alpha,
      source: merged.fundamentals.source,
    });
    deps.holdingsRepo.replaceSnapshot(scheme.id, merged.asOfDate, merged.holdings);
    deps.holdingsRepo.prune(scheme.id, retentionCap);
  });

  return {
    schemeId: scheme.id,
    source: merged.source,
    asOfDate: merged.asOfDate,
    holdingsCount: merged.holdings.length,
  };
}
