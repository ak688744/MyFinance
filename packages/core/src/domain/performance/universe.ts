import type { NavPoint, UniverseFund } from '../../types';
import type { PerformanceUniverseRepo } from '../../repositories/types';
import { parseAmfiNavList, selectUniverse } from './amfiNavList';
import { previousMonthEnd, shiftMonths, toMonthEnd, type Series } from './series';
import { benchmarkForFund, proxyCodes } from './benchmarks';
import { computeCategoryStats, computeFundStats } from './fundStats';

export type RefreshUniverseDeps = {
  fetchNavList: () => Promise<string>;
  fetchHistory: (amfiCode: string) => Promise<NavPoint[]>;
  repo: PerformanceUniverseRepo;
  runInTransaction: <T>(fn: () => T) => T;
  concurrency?: number;
  maxFailureRatio?: number;
  now?: () => Date;
  onProgress?: (done: number, total: number) => void;
};

export type RefreshUniverseResult = { builtAt: string; asOf: string; funds: number; ranked: number; failed: number };

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function refreshUniverse(deps: RefreshUniverseDeps): Promise<RefreshUniverseResult> {
  const builtAt = (deps.now?.() ?? new Date()).toISOString();
  const rows = selectUniverse(parseAmfiNavList(await deps.fetchNavList()));
  if (rows.length === 0) throw new Error('AMFI NAV list produced no Direct-Growth funds');

  const latest = rows.map((r) => r.navDate).filter((d): d is string => !!d).sort().pop() ?? builtAt.slice(0, 10);
  const asOf = previousMonthEnd(latest);

  let done = 0;
  const settled = await mapWithConcurrency(rows, deps.concurrency ?? 8, async (r) => {
    const h = await deps.fetchHistory(r.amfiCode);
    deps.onProgress?.(++done, rows.length);
    return h;
  });
  // An empty history (e.g. an mfapi outage answering 200 with no data) is a failure for the ratio check.
  const failed = settled.filter((s) => s.status === 'rejected' || s.value.length === 0).length;
  if (failed / rows.length > (deps.maxFailureRatio ?? 0.2)) {
    throw new Error(`Universe refresh aborted: ${failed} of ${rows.length} NAV histories failed`);
  }

  const monthly = new Map<string, Series>();
  rows.forEach((r, i) => {
    const s = settled[i];
    if (s.status === 'fulfilled' && s.value.length > 0) monthly.set(r.amfiCode, toMonthEnd(s.value));
  });

  // Benchmark proxies are ordinary index funds, normally already in the universe; fetch any that aren't.
  for (const code of proxyCodes()) {
    if (monthly.has(code)) continue;
    try {
      const h = await deps.fetchHistory(code);
      if (h.length > 0) monthly.set(code, toMonthEnd(h));
    } catch {
      /* relative metrics become null for that category */
    }
  }

  const rankFrom = shiftMonths(asOf, -36);
  const funds: UniverseFund[] = rows.map((r) => {
    const historyStart = monthly.get(r.amfiCode)?.[0]?.date ?? null;
    return {
      amfiCode: r.amfiCode,
      schemeName: r.schemeName,
      amc: r.amc,
      category: r.category,
      latestNav: r.nav,
      latestNavDate: r.navDate,
      historyStart,
      rankable: historyStart != null && historyStart <= rankFrom,
      builtAt,
    };
  });

  const statsRows = funds
    .filter((f) => monthly.has(f.amfiCode))
    .map((f) => {
      const ref = benchmarkForFund(f.category, f.schemeName);
      const benchCode = ref?.kind === 'proxy' ? ref.amfiCode : null;
      return {
        stats: computeFundStats({
          amfiCode: f.amfiCode,
          monthly: monthly.get(f.amfiCode)!,
          bench: benchCode ? monthly.get(benchCode) ?? null : null,
          benchmarkCode: benchCode,
          asOf,
        }),
        category: f.category,
        rankable: f.rankable,
      };
    });
  const { categoryStats, performance } = computeCategoryStats(statsRows, asOf);

  const keepFrom = shiftMonths(asOf, -120);
  const monthlyNav = funds.flatMap((f) =>
    (monthly.get(f.amfiCode) ?? [])
      .filter((p) => p.date >= keepFrom)
      .map((p) => ({ amfiCode: f.amfiCode, monthEnd: p.date, nav: p.nav })),
  );

  deps.runInTransaction(() => deps.repo.replaceAll({ builtAt, asOf, funds, monthlyNav, performance, categoryStats }));
  return { builtAt, asOf, funds: funds.length, ranked: funds.filter((f) => f.rankable).length, failed };
}
