// packages/core/src/domain/performance/views.ts
import type { FundPerformanceRow } from '../../types';

export function pct1(x: number | null | undefined): number | null {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10;
}

export function inr0(x: number | null | undefined): number | null {
  return x == null || !Number.isFinite(x) ? null : Math.round(x);
}

export type PerformanceView = {
  amfiCode: string; asOf: string; benchmarkCode: string | null;
  r1yPct: number | null; r3yPct: number | null; r5yPct: number | null; r10yPct: number | null;
  vol3yPct: number | null; maxDrawdown5yPct: number | null;
  rolling3yBeatPct: number | null; rolling3yMedianExcessPct: number | null;
  upCapture3yPct: number | null; downCapture3yPct: number | null;
  categoryPercentile3y: number | null; categoryPercentile5y: number | null;
};

export function performanceView(r: FundPerformanceRow): PerformanceView {
  return {
    amfiCode: r.amfiCode,
    asOf: r.asOf,
    benchmarkCode: r.benchmarkCode,
    r1yPct: pct1(r.r1y),
    r3yPct: pct1(r.r3y),
    r5yPct: pct1(r.r5y),
    r10yPct: pct1(r.r10y),
    vol3yPct: pct1(r.vol3y),
    maxDrawdown5yPct: pct1(r.maxDrawdown5y),
    rolling3yBeatPct: pct1(r.rolling3yBeatPct),
    rolling3yMedianExcessPct: pct1(r.rolling3yMedianExcess),
    upCapture3yPct: pct1(r.upCapture3y),
    downCapture3yPct: pct1(r.downCapture3y),
    categoryPercentile3y: pct1(r.categoryPctile3y),
    categoryPercentile5y: pct1(r.categoryPctile5y),
  };
}
