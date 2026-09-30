// packages/core/src/domain/performance/factSheet.ts
import type { CategoryStatRow, FundPerformanceRow } from '../../types';
import type { PerformanceWithName } from '../../repositories/types';
import { TAX_RULES, type TaxRules } from './taxRules';
import { buildLots, classifyLots, type LotOpts, type LotTxn } from './lots';
import { replayCashflows, type FlowTxn } from './replay';
import type { BenchmarkRef } from './benchmarks';
import type { Series } from './series';
import { inr0, pct1 } from './views';

export type OwnedPositionInput = {
  schemeId: number;
  schemeName: string;
  amfiCode: string | null;
  category: string | null;
  units: number;
  valueInr: number;
  currentNav: number | null;
  performance: FundPerformanceRow | null;
  benchmark: BenchmarkRef | null;
  benchmarkPerformance: FundPerformanceRow | null;
  benchmarkDaily: Series | null;
  flows: FlowTxn[];
  lots: LotTxn[];
  taxOpts: LotOpts | null;
  /** True when some held account for this scheme has no transactions, so flows/lots would not match the holding value. */
  transactionsPartial?: boolean;
  directTwin: { amfiCode: string; schemeName: string; annualDrag: number } | null;
};

export type FactSheetInput = {
  asOf: string;
  builtAt: string;
  today: string;
  positions: OwnedPositionInput[];
  categoryStats: Record<string, CategoryStatRow[]>;
  candidates: Record<string, PerformanceWithName[]>;
  allCategoryStats: CategoryStatRow[];
  profile: { label: string; equityPct: number; smallMidPctOfEquity: number; nonEquityPct: number } | null;
  portfolioInsights: { kind: string; title: string; detail: string }[];
  dataQuality: { schemeId: number; issue: string }[];
  rules?: TaxRules;
};

type Trio = { r1y: number | null; r3y: number | null; r5y: number | null };
type Unavailable = { unavailable: string };

export type FactSheetFund = {
  schemeId: number;
  name: string;
  amfiCode: string | null;
  category: string | null;
  valueInr: number | null;
  weightPct: number | null;
  benchmark: string | null;
  returnsPct: Trio;
  benchmarkReturnsPct: Trio | null;
  categoryMedianPct: Trio;
  excessVsBenchmarkPct: Trio | null;
  excessVsCategoryPct: Trio;
  categoryPercentile: { r3y: number | null; r5y: number | null };
  rolling3y: { beatPct: number | null; medianExcessPct: number | null };
  risk: {
    vol3yPct: number | null; maxDrawdown5yPct: number | null; upCapturePct: number | null;
    downCapturePct: number | null; categoryMedianDrawdown5yPct: number | null;
  };
  replay: { actualXirrPct: number | null; benchmarkXirrPct: number | null; diffInr: number | null } | Unavailable;
  lots:
    | {
        taxRegime: 'equity' | 'slab'; shortTermGainInr: number | null; longTermGainInr: number | null;
        unrealisedGainInr: number | null; elssLockedValueInr: number | null; elssLockedUntil: string | null;
        exitLoadWindowValueInr: number | null;
      }
    | Unavailable;
  planDrag: { twinName: string; twinAmfiCode: string; annualDragPct: number | null; annualDragInr: number | null } | null;
  performanceAvailable: boolean;
};

export type FactSheetCandidate = {
  amfiCode: string; name: string; r3yPct: number | null; r5yPct: number | null;
  rolling3yBeatPct: number | null; rolling3yMedianExcessPct: number | null;
  maxDrawdown5yPct: number | null; upCapturePct: number | null; downCapturePct: number | null;
  recencyBiased: true;
};

export type FactSheet = {
  asOf: string;
  builtAt: string;
  today: string;
  totalValueInr: number | null;
  profile: FactSheetInput['profile'];
  funds: FactSheetFund[];
  candidates: Record<string, FactSheetCandidate[]>;
  categories: {
    category: string; n: number | null; medianR1yPct: number | null; medianR3yPct: number | null;
    medianR5yPct: number | null; medianVol3yPct: number | null; medianMaxDrawdown5yPct: number | null;
  }[];
  portfolioInsights: FactSheetInput['portfolioInsights'];
  dataQuality: FactSheetInput['dataQuality'];
  taxRules: { effectiveFrom: string; shortTermRatePct: number; longTermRatePct: number; longTermExemptionInr: number; elssLockInMonths: number };
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const diff = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : a - b);
const median = (stats: CategoryStatRow[] | undefined, metric: string) => stats?.find((s) => s.metric === metric)?.median ?? null;
const trioPct = (t: { r1y: number | null; r3y: number | null; r5y: number | null }): Trio => ({ r1y: pct1(t.r1y), r3y: pct1(t.r3y), r5y: pct1(t.r5y) });

export function pickCandidates(rows: PerformanceWithName[], exclude: Set<string>, n = 5): PerformanceWithName[] {
  const key = (r: PerformanceWithName) => r.rolling3yMedianExcess ?? r.r3y;
  return rows
    .filter((r) => r.rankable && !exclude.has(r.amfiCode) && key(r) != null)
    .sort((a, b) => key(b)! - key(a)!)
    .slice(0, n);
}

function benchmarkReturns(p: OwnedPositionInput, input: FactSheetInput): { r1y: number | null; r3y: number | null; r5y: number | null } | null {
  if (p.benchmark?.kind === 'proxy' && p.benchmarkPerformance) {
    return { r1y: p.benchmarkPerformance.r1y, r3y: p.benchmarkPerformance.r3y, r5y: p.benchmarkPerformance.r5y };
  }
  if (p.benchmark?.kind === 'category_median') {
    const s = input.categoryStats[p.benchmark.category];
    return { r1y: median(s, 'r1y'), r3y: median(s, 'r3y'), r5y: median(s, 'r5y') };
  }
  return null;
}

function buildFund(p: OwnedPositionInput, input: FactSheetInput, totalValue: number, rules: TaxRules): FactSheetFund {
  const perf = p.performance;
  const cs = p.category ? input.categoryStats[p.category] : undefined;
  const bench = benchmarkReturns(p, input);
  const catMed = { r1y: median(cs, 'r1y'), r3y: median(cs, 'r3y'), r5y: median(cs, 'r5y') };

  const partial = { unavailable: 'transactions cover only part of this holding' };
  let replay: FactSheetFund['replay'];
  if (p.transactionsPartial) replay = partial;
  else if (p.flows.length === 0) replay = { unavailable: 'no transactions imported' };
  else if (p.benchmark?.kind !== 'proxy' || !p.benchmarkDaily) replay = { unavailable: 'no index benchmark for this category' };
  else {
    const r = replayCashflows(p.flows, p.benchmarkDaily, input.today, p.valueInr);
    replay = 'unavailable' in r ? r : { actualXirrPct: pct1(r.actualXirr), benchmarkXirrPct: pct1(r.replayXirr), diffInr: inr0(r.diffInr) };
  }

  let lots: FactSheetFund['lots'];
  if (p.transactionsPartial) lots = partial;
  else if (p.lots.length === 0) lots = { unavailable: 'no transactions imported' };
  else if (!p.taxOpts) lots = { unavailable: 'fund category unknown' };
  else if (p.currentNav == null) lots = { unavailable: 'current NAV unavailable' };
  else {
    const s = classifyLots(buildLots(p.lots), p.currentNav, input.today, p.taxOpts, rules);
    lots = {
      taxRegime: s.taxRegime,
      shortTermGainInr: inr0(s.shortTermGainInr),
      longTermGainInr: inr0(s.longTermGainInr),
      unrealisedGainInr: inr0(s.unrealisedGainInr),
      elssLockedValueInr: inr0(s.elssLockedValueInr),
      elssLockedUntil: s.elssLockedUntil,
      exitLoadWindowValueInr: inr0(s.exitLoadWindowValueInr),
    };
  }

  return {
    schemeId: p.schemeId,
    name: p.schemeName,
    amfiCode: p.amfiCode,
    category: p.category,
    valueInr: inr0(p.valueInr),
    weightPct: totalValue > 0 ? pct1(p.valueInr / totalValue) : null,
    benchmark: p.benchmark?.label ?? null,
    returnsPct: trioPct({ r1y: perf?.r1y ?? null, r3y: perf?.r3y ?? null, r5y: perf?.r5y ?? null }),
    benchmarkReturnsPct: bench ? trioPct(bench) : null,
    categoryMedianPct: trioPct(catMed),
    excessVsBenchmarkPct: bench
      ? trioPct({ r1y: diff(perf?.r1y, bench.r1y), r3y: diff(perf?.r3y, bench.r3y), r5y: diff(perf?.r5y, bench.r5y) })
      : null,
    excessVsCategoryPct: trioPct({ r1y: diff(perf?.r1y, catMed.r1y), r3y: diff(perf?.r3y, catMed.r3y), r5y: diff(perf?.r5y, catMed.r5y) }),
    categoryPercentile: { r3y: pct1(perf?.categoryPctile3y), r5y: pct1(perf?.categoryPctile5y) },
    rolling3y: { beatPct: pct1(perf?.rolling3yBeatPct), medianExcessPct: pct1(perf?.rolling3yMedianExcess) },
    risk: {
      vol3yPct: pct1(perf?.vol3y),
      maxDrawdown5yPct: pct1(perf?.maxDrawdown5y),
      upCapturePct: pct1(perf?.upCapture3y),
      downCapturePct: pct1(perf?.downCapture3y),
      categoryMedianDrawdown5yPct: pct1(median(cs, 'maxDrawdown5y')),
    },
    replay,
    lots,
    planDrag: p.directTwin
      ? {
          twinName: p.directTwin.schemeName,
          twinAmfiCode: p.directTwin.amfiCode,
          annualDragPct: pct1(p.directTwin.annualDrag),
          annualDragInr: inr0(p.directTwin.annualDrag * p.valueInr),
        }
      : null,
    performanceAvailable: perf != null,
  };
}

export function buildFactSheet(input: FactSheetInput): FactSheet {
  const rules = input.rules ?? TAX_RULES;
  const totalValue = input.positions.reduce((s, p) => s + p.valueInr, 0);

  const candidates: FactSheet['candidates'] = {};
  for (const [category, rows] of Object.entries(input.candidates)) {
    candidates[category] = rows.map((r) => ({
      amfiCode: r.amfiCode,
      name: r.schemeName,
      r3yPct: pct1(r.r3y),
      r5yPct: pct1(r.r5y),
      rolling3yBeatPct: pct1(r.rolling3yBeatPct),
      rolling3yMedianExcessPct: pct1(r.rolling3yMedianExcess),
      maxDrawdown5yPct: pct1(r.maxDrawdown5y),
      upCapturePct: pct1(r.upCapture3y),
      downCapturePct: pct1(r.downCapture3y),
      recencyBiased: true,
    }));
  }

  const byCategory = new Map<string, CategoryStatRow[]>();
  for (const s of input.allCategoryStats) byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);
  const categories = [...byCategory.entries()].map(([category, s]) => ({
    category,
    n: s.find((x) => x.metric === 'r3y')?.n ?? null,
    medianR1yPct: pct1(median(s, 'r1y')),
    medianR3yPct: pct1(median(s, 'r3y')),
    medianR5yPct: pct1(median(s, 'r5y')),
    medianVol3yPct: pct1(median(s, 'vol3y')),
    medianMaxDrawdown5yPct: pct1(median(s, 'maxDrawdown5y')),
  }));

  return {
    asOf: input.asOf,
    builtAt: input.builtAt,
    today: input.today,
    totalValueInr: inr0(totalValue),
    profile: input.profile
      ? {
          label: input.profile.label,
          equityPct: round1(input.profile.equityPct),
          smallMidPctOfEquity: round1(input.profile.smallMidPctOfEquity),
          nonEquityPct: round1(input.profile.nonEquityPct),
        }
      : null,
    funds: input.positions.map((p) => buildFund(p, input, totalValue, rules)),
    candidates,
    categories,
    portfolioInsights: input.portfolioInsights,
    dataQuality: input.dataQuality,
    taxRules: {
      effectiveFrom: rules.effectiveFrom,
      shortTermRatePct: round1(rules.equity.shortTermRate * 100),
      longTermRatePct: round1(rules.equity.longTermRate * 100),
      longTermExemptionInr: rules.equity.longTermExemptionInrPerYear,
      elssLockInMonths: rules.elssLockInMonths,
    },
  };
}
