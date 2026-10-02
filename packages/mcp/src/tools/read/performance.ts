// packages/mcp/src/tools/read/performance.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  performanceView, relativeRolling, captureRatios, maxDrawdown, shiftMonths, benchmarkForFund, pct1,
  buildLots, classifyLots, estimateExitCost, replayCashflows, txnsToFlows, txnsToLots, taxOptsFor, TAX_RULES, inr0,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

const NOT_BUILT =
  'The fund performance universe has not been built yet. It is rebuilt monthly from the Investments page (Performance data → Refresh).';

export const SORT_KEYS = ['rolling3yMedianExcess', 'r3y', 'r5y', 'maxDrawdown5y', 'downCapture3y'] as const;
type SortKey = (typeof SORT_KEYS)[number];

function unknownCategory(ctx: McpContext, category: string): ToolResult {
  return errorResult(`Unknown category "${category}". Available: ${ctx.repos.performanceUniverseRepo.listCategories().join(', ')}`);
}

export async function runGetFundPerformance(ctx: McpContext, input: { codes: string[] }): Promise<ToolResult> {
  const repo = ctx.repos.performanceUniverseRepo;
  if (!repo.getMeta()) return errorResult(NOT_BUILT);
  const rows = repo.getPerformance(input.codes);
  const funds = rows.map((r) => {
    const f = repo.getFund(r.amfiCode);
    return { schemeName: f?.schemeName ?? null, category: f?.category ?? null, rankable: f?.rankable ?? false, ...performanceView(r) };
  });
  const missing = input.codes.filter((c) => !rows.some((r) => r.amfiCode === c));
  return ok({ funds, missing });
}

export async function runCompareToBenchmark(ctx: McpContext, input: { code: string; windowYears?: number }): Promise<ToolResult> {
  const repo = ctx.repos.performanceUniverseRepo;
  const asOf = repo.getMeta()?.asOf;
  if (!asOf) return errorResult(NOT_BUILT);
  const fund = repo.getFund(input.code);
  if (!fund) return errorResult(`Fund ${input.code} is not in the Direct-Growth universe (Regular/IDCW plans are not tracked).`);
  const ref = benchmarkForFund(fund.category, fund.schemeName);
  if (!ref || ref.kind !== 'proxy') {
    return errorResult(`No index benchmark for category ${fund.category}; compare against get_category_stats instead.`);
  }
  const years = input.windowYears ?? 3;
  const f = repo.getMonthlyNav(input.code);
  const b = repo.getMonthlyNav(ref.amfiCode);
  const rel = relativeRolling(f, b, asOf, { windowYears: years, spanMonths: 24 });
  const cap = captureRatios(f, b, asOf, years);
  const from = shiftMonths(asOf, -60);
  return ok({
    amfiCode: fund.amfiCode, schemeName: fund.schemeName, benchmark: ref.label, benchmarkCode: ref.amfiCode, asOf,
    windowYears: years, windows: rel.windows,
    beatPct: pct1(rel.beatPct), medianExcessPct: pct1(rel.medianExcess),
    upCapturePct: pct1(cap.up), downCapturePct: pct1(cap.down),
    fundMaxDrawdown5yPct: pct1(maxDrawdown(f, from, asOf)),
    benchmarkMaxDrawdown5yPct: pct1(maxDrawdown(b, from, asOf)),
  });
}

export async function runGetCategoryStats(ctx: McpContext, input: { category: string }): Promise<ToolResult> {
  const repo = ctx.repos.performanceUniverseRepo;
  if (!repo.getMeta()) return errorResult(NOT_BUILT);
  const rows = repo.getCategoryStats(input.category);
  if (rows.length === 0) return unknownCategory(ctx, input.category);
  return ok({
    category: input.category,
    asOf: rows[0].asOf,
    stats: rows.map((r) => ({ metric: r.metric, p25Pct: pct1(r.p25), medianPct: pct1(r.median), p75Pct: pct1(r.p75), n: r.n })),
  });
}

export async function runScreenCategory(
  ctx: McpContext,
  input: { category: string; sortBy?: SortKey; minHistoryYears?: number; limit?: number },
): Promise<ToolResult> {
  const repo = ctx.repos.performanceUniverseRepo;
  const asOf = repo.getMeta()?.asOf;
  if (!asOf) return errorResult(NOT_BUILT);
  const rows = repo.listPerformanceByCategory(input.category);
  if (rows.length === 0) return unknownCategory(ctx, input.category);
  const sortBy = input.sortBy ?? 'rolling3yMedianExcess';
  const minStart = shiftMonths(asOf, -12 * (input.minHistoryYears ?? 3));
  const ascending = sortBy === 'downCapture3y';
  const funds = rows
    .filter((r) => {
      const start = repo.getFund(r.amfiCode)?.historyStart;
      return start != null && start <= minStart && r[sortBy] != null;
    })
    .sort((a, b) => (ascending ? a[sortBy]! - b[sortBy]! : b[sortBy]! - a[sortBy]!))
    .slice(0, Math.min(input.limit ?? 10, 25))
    .map((r) => ({ schemeName: r.schemeName, ...performanceView(r) }));
  return ok({
    category: input.category, sortBy, asOf,
    recencyNote: 'Rankings reflect recent rolling windows and are recency-biased; weigh drawdown and down-capture too.',
    funds,
  });
}

const today = () => new Date().toISOString().slice(0, 10);

type OwnedFund =
  | { error: string }
  | {
      scheme: NonNullable<ReturnType<McpContext['repos']['schemeRepo']['getSchemeById']>>;
      txns: ReturnType<McpContext['repos']['investmentTxRepo']['getTransactionsByScheme']>;
      taxOpts: ReturnType<typeof taxOptsFor>;
      nav: number | null;
    };

async function ownedFund(ctx: McpContext, schemeId: number): Promise<OwnedFund> {
  const scheme = ctx.repos.schemeRepo.getSchemeById(schemeId);
  if (!scheme) return { error: `No owned scheme with id ${schemeId}. Use get_portfolio_holdings_status for scheme ids.` };
  const txns = ctx.repos.investmentTxRepo.getTransactionsByScheme(schemeId);
  const category = scheme.amfiCode ? ctx.repos.performanceUniverseRepo.getFund(scheme.amfiCode)?.category ?? null : null;
  const taxOpts = taxOptsFor(category, scheme.schemeName, (scheme as { category?: string | null }).category ?? null);
  const nav = scheme.amfiCode ? await ctx.marketData.getLatestNAV(scheme.amfiCode) : null;
  return { scheme, txns, taxOpts, nav };
}

export async function runReplayCashflows(ctx: McpContext, input: { schemeId: number; targetCode: string }): Promise<ToolResult> {
  const o = await ownedFund(ctx, input.schemeId);
  if ('error' in o) return errorResult(o.error);
  if (o.txns.length === 0) return errorResult('No transactions imported for this fund, so its cash flows cannot be replayed.');
  if (o.nav == null) return errorResult('Current NAV unavailable for this fund.');
  const first = o.txns.map((t) => t.transactionDate).sort()[0];
  const target = await ctx.marketData.getNAVHistory(input.targetCode, first, today());
  if (target.length === 0) return errorResult(`No NAV history for target ${input.targetCode}.`);
  const units = buildLots(txnsToLots(o.txns)).reduce((s, l) => s + l.units, 0);
  const asOf = target[target.length - 1].date;
  const r = replayCashflows(txnsToFlows(o.txns), target, asOf, units * o.nav);
  if ('unavailable' in r) return errorResult(`Replay unavailable: ${r.unavailable}`);
  return ok({
    schemeId: input.schemeId, schemeName: o.scheme.schemeName, targetCode: input.targetCode, asOf,
    actualXirrPct: pct1(r.actualXirr), replayXirrPct: pct1(r.replayXirr),
    actualValueInr: inr0(r.actualValueInr), replayValueInr: inr0(r.replayValueInr), diffInr: inr0(r.diffInr),
  });
}

export async function runGetLotsAndTax(ctx: McpContext, input: { schemeId: number }): Promise<ToolResult> {
  const o = await ownedFund(ctx, input.schemeId);
  if ('error' in o) return errorResult(o.error);
  const lots = buildLots(txnsToLots(o.txns));
  if (lots.length === 0) return errorResult('No transactions imported for this fund, so lots, tax and lock-in are unknown.');
  if (!o.taxOpts) return errorResult('Fund category unknown, so the tax regime cannot be determined.');
  if (o.nav == null) return errorResult('Current NAV unavailable for this fund.');
  const s = classifyLots(lots, o.nav, today(), o.taxOpts);
  return ok({
    schemeId: input.schemeId, schemeName: o.scheme.schemeName, asOf: today(), taxRegime: s.taxRegime,
    unitsHeld: Math.round(s.units * 1000) / 1000, valueInr: inr0(s.valueInr), costInr: inr0(s.costInr),
    unrealisedGainInr: inr0(s.unrealisedGainInr), shortTermGainInr: inr0(s.shortTermGainInr), longTermGainInr: inr0(s.longTermGainInr),
    elssLockedValueInr: inr0(s.elssLockedValueInr), elssLockedUntil: s.elssLockedUntil, exitLoadWindowValueInr: inr0(s.exitLoadWindowValueInr),
    taxRulesEffectiveFrom: TAX_RULES.effectiveFrom,
    note: 'Estimates from imported transactions; verify with a tax professional before acting.',
  });
}

export async function runEstimateSwitchCost(
  ctx: McpContext,
  input: { schemeId: number; units?: number; exitLoadPct?: number; ltcgExemptionAvailableInr?: number },
): Promise<ToolResult> {
  const o = await ownedFund(ctx, input.schemeId);
  if ('error' in o) return errorResult(o.error);
  const lots = buildLots(txnsToLots(o.txns));
  if (lots.length === 0) return errorResult('No transactions imported for this fund, so the exit cost cannot be estimated.');
  if (!o.taxOpts) return errorResult('Fund category unknown, so the tax regime cannot be determined.');
  if (o.nav == null) return errorResult('Current NAV unavailable for this fund.');
  const c = estimateExitCost(lots, o.nav, today(), {
    ...o.taxOpts, unitsToSell: input.units, exitLoadPct: input.exitLoadPct, ltcgExemptionAvailableInr: input.ltcgExemptionAvailableInr,
  });
  return ok({
    schemeId: input.schemeId, schemeName: o.scheme.schemeName, asOf: today(),
    unitsSold: Math.round(c.unitsSold * 1000) / 1000, lockedUnitsSkipped: Math.round(c.lockedUnitsSkipped * 1000) / 1000,
    valueInr: inr0(c.valueInr), stcgTaxInr: inr0(c.stcgTaxInr), ltcgTaxInr: inr0(c.ltcgTaxInr),
    exitLoadInr: inr0(c.exitLoadInr), totalInr: inr0(c.totalInr), note: c.note,
  });
}

export function registerPerformanceTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_fund_performance',
    {
      description:
        'Performance stats for Direct-Growth funds by AMFI code (max 25): trailing 1/3/5/10y CAGR, 3y volatility, 5y max drawdown, ' +
        'rolling 3y beat % and median excess vs its benchmark proxy, up/down capture, category percentiles. All fields ending Pct are percentages. ' +
        'Codes not in the Direct-Growth universe come back in `missing`.',
      inputSchema: { codes: z.array(z.string()).min(1).max(25) },
    },
    async (input) => runGetFundPerformance(ctx, input),
  );
  server.registerTool(
    'compare_to_benchmark',
    {
      description:
        "Compare one fund with its category's index-fund benchmark proxy over rolling windows: beat %, median excess, capture ratios and drawdowns. " +
        'Optional windowYears (default 3).',
      inputSchema: { code: z.string(), windowYears: z.number().int().min(1).max(5).optional() },
    },
    async (input) => runCompareToBenchmark(ctx, input),
  );
  server.registerTool(
    'get_category_stats',
    {
      description:
        "Quartiles (p25/median/p75, in percent) of a category's rankable funds for r1y, r3y, r5y, vol3y, maxDrawdown5y, rolling3yMedianExcess. " +
        'Category names look like "Equity: Small Cap". An unknown name returns the available list.',
      inputSchema: { category: z.string() },
    },
    async (input) => runGetCategoryStats(ctx, input),
  );
  server.registerTool(
    'screen_category',
    {
      description:
        'List the top Direct-Growth funds in a category (default: at least 3 years of history, sorted by rolling3yMedianExcess, limit 10, max 25). ' +
        'sortBy: rolling3yMedianExcess | r3y | r5y | maxDrawdown5y (least severe first) | downCapture3y (lowest first). Results are recency-biased; say so when citing them.',
      inputSchema: {
        category: z.string(),
        sortBy: z.enum(SORT_KEYS).optional(),
        minHistoryYears: z.number().int().min(1).max(10).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (input) => runScreenCategory(ctx, input),
  );
  server.registerTool(
    'replay_cashflows',
    {
      description:
        "Replay an owned fund's actual purchases and redemptions into another fund or benchmark proxy (targetCode = AMFI code). " +
        'Returns actual vs replay XIRR (percent) and value (INR) and diffInr (actual - replay). Use for "what if my SIPs had gone into X".',
      inputSchema: { schemeId: z.number().int().positive(), targetCode: z.string() },
    },
    async (input) => runReplayCashflows(ctx, input),
  );
  server.registerTool(
    'get_lots_and_tax',
    {
      description:
        'Purchase lots (first-in first-out) for an owned fund: short- vs long-term unrealised gains, ELSS-locked value and unlock date, value inside the typical 12-month exit-load window. ' +
        'Call this before discussing any exit or switch.',
      inputSchema: { schemeId: z.number().int().positive() },
    },
    async (input) => runGetLotsAndTax(ctx, input),
  );
  server.registerTool(
    'estimate_switch_cost',
    {
      description:
        'Estimated tax plus exit load for a hypothetical exit from an owned fund (optional units; ELSS-locked units are skipped). ' +
        'Estimate only: losses are not netted; state that the user should verify with a tax professional.',
      inputSchema: {
        schemeId: z.number().int().positive(),
        units: z.number().positive().optional(),
        exitLoadPct: z.number().min(0).max(5).optional(),
        ltcgExemptionAvailableInr: z.number().min(0).optional(),
      },
    },
    async (input) => runEstimateSwitchCost(ctx, input),
  );
}
