// packages/core/src/domain/performance/fundStats.ts
import type { CategoryStatRow, FundPerformanceRow } from '../../types';
import { shiftMonths, type Series } from './series';
import { trailingReturn, relativeRolling } from './returns';
import { annualVol, captureRatios, maxDrawdown } from './risk';
import { percentileOf, quantiles } from './category';

export type FundStats = Omit<FundPerformanceRow, 'categoryPctile3y' | 'categoryPctile5y'>;

export function computeFundStats(i: {
  amfiCode: string; monthly: Series; bench: Series | null; benchmarkCode: string | null; asOf: string;
}): FundStats {
  const rel = i.bench ? relativeRolling(i.monthly, i.bench, i.asOf, { windowYears: 3, spanMonths: 24 }) : null;
  const cap = i.bench ? captureRatios(i.monthly, i.bench, i.asOf, 3) : null;
  return {
    amfiCode: i.amfiCode,
    asOf: i.asOf,
    benchmarkCode: i.benchmarkCode,
    r1y: trailingReturn(i.monthly, i.asOf, 1),
    r3y: trailingReturn(i.monthly, i.asOf, 3),
    r5y: trailingReturn(i.monthly, i.asOf, 5),
    r10y: trailingReturn(i.monthly, i.asOf, 10),
    vol3y: annualVol(i.monthly, i.asOf, 3),
    maxDrawdown5y: maxDrawdown(i.monthly, shiftMonths(i.asOf, -60), i.asOf),
    rolling3yBeatPct: rel?.beatPct ?? null,
    rolling3yMedianExcess: rel?.medianExcess ?? null,
    upCapture3y: cap?.up ?? null,
    downCapture3y: cap?.down ?? null,
  };
}

export const CATEGORY_METRICS = ['r1y', 'r3y', 'r5y', 'vol3y', 'maxDrawdown5y', 'rolling3yMedianExcess'] as const;

export function computeCategoryStats(
  rows: { stats: FundStats; category: string; rankable: boolean }[],
  asOf: string,
): { categoryStats: CategoryStatRow[]; performance: FundPerformanceRow[] } {
  const byCat = new Map<string, FundStats[]>();
  for (const r of rows) {
    if (!r.rankable) continue;
    const list = byCat.get(r.category) ?? [];
    list.push(r.stats);
    byCat.set(r.category, list);
  }
  const categoryStats: CategoryStatRow[] = [];
  for (const [category, list] of byCat) {
    for (const metric of CATEGORY_METRICS) {
      const q = quantiles(list.map((s) => s[metric]).filter((v): v is number => v != null));
      if (q) categoryStats.push({ category, metric, ...q, asOf });
    }
  }
  const performance = rows.map((r) => {
    const peers = byCat.get(r.category) ?? [];
    const val = (k: 'r3y' | 'r5y') => peers.map((s) => s[k]).filter((v): v is number => v != null);
    return {
      ...r.stats,
      categoryPctile3y: r.rankable ? percentileOf(r.stats.r3y, val('r3y')) : null,
      categoryPctile5y: r.rankable ? percentileOf(r.stats.r5y, val('r5y')) : null,
    };
  });
  return { categoryStats, performance };
}
