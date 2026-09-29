import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getHoldings,
  fundOverlap,
  overlapMatrix,
  portfolioLookthrough,
  portfolioConcentration,
  detectRedundancy,
  portfolioCost,
  checkGoalFit,
  type OwnedFund,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

function monthsSince(isoDate: string): number {
  const d = new Date(isoDate);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

export async function buildOwnedFunds(
  ctx: McpContext,
  account?: string,
): Promise<OwnedFund[]> {
  const filters = account ? { account } : {};
  const holdings = await getHoldings(
    {
      txRepo: ctx.repos.investmentTxRepo,
      holdingsRepo: ctx.repos.holdingsRepo,
      nav: ctx.nav,
    },
    filters,
  );

  const byScheme = new Map<number, (typeof holdings)[number]>();
  for (const h of holdings) {
    if (h.schemeId != null && !byScheme.has(h.schemeId)) {
      byScheme.set(h.schemeId, h);
    }
  }

  const funds: OwnedFund[] = [];
  for (const [schemeId, holding] of byScheme) {
    const snapshot = ctx.repos.schemeHoldingsRepo.getLatestSnapshot(schemeId);
    const fundamentals = ctx.repos.schemeFundamentalsRepo.get(schemeId);
    funds.push({
      schemeId,
      schemeName: holding.schemeName,
      category: holding.category,
      currentValueInr: holding.currentValue,
      planType: fundamentals?.planType ?? null,
      expenseRatioDirect: fundamentals?.expenseRatioDirect ?? null,
      expenseRatioRegular: fundamentals?.expenseRatioRegular ?? null,
      holdings: snapshot.map((row) => ({
        securityName: row.securityName,
        isin: row.isin,
        weightPct: row.weightPct,
        sector: row.sector,
        marketCapBucket: row.marketCapBucket,
      })),
    });
  }

  return funds;
}

function buildCoverage(ctx: McpContext, account?: string) {
  return buildOwnedFunds(ctx, account).then((funds) =>
    funds.map((f) => {
      const snapshot = ctx.repos.schemeHoldingsRepo.getLatestSnapshot(f.schemeId);
      const asOfDate = snapshot.length > 0 ? snapshot[0].asOfDate : null;
      // Expose the stored AMFI code so the agent refreshes with the EXACT code
      // (never a guessed one). A null amfiCode means the fund cannot be fetched.
      const amfiCode = ctx.repos.schemeRepo.getSchemeById(f.schemeId)?.amfiCode ?? null;
      return {
        schemeId: f.schemeId,
        schemeName: f.schemeName,
        amfiCode,
        hasHoldings: snapshot.length > 0,
        asOfDate,
        staleMonths: asOfDate != null ? monthsSince(asOfDate) : null,
        refreshable: amfiCode != null,
      };
    }),
  );
}

export async function runGetFundFundamentals(
  ctx: McpContext,
  input: { schemeId: number },
): Promise<ToolResult> {
  const row = ctx.repos.schemeFundamentalsRepo.get(input.schemeId);
  if (!row) {
    return errorResult(`No fundamentals stored for scheme ${input.schemeId}.`);
  }
  return ok({
    schemeId: row.schemeId,
    expenseRatioDirect: row.expenseRatioDirect,
    expenseRatioRegular: row.expenseRatioRegular,
    planType: row.planType,
    aumInr: row.aum,
    benchmarkName: row.benchmarkName,
    stdDev: row.stdDev,
    sharpe: row.sharpe,
    beta: row.beta,
    alpha: row.alpha,
    source: row.source,
    fetchedAt: row.fetchedAt,
  });
}

export async function runGetPortfolioHoldingsStatus(
  ctx: McpContext,
  input: { account?: string },
): Promise<ToolResult> {
  const coverage = await buildCoverage(ctx, input.account);
  return ok({ coverage });
}

export async function runAnalyzeFundOverlap(
  ctx: McpContext,
  input: { account?: string },
): Promise<ToolResult> {
  const funds = await buildOwnedFunds(ctx, input.account);
  const pairs = overlapMatrix(funds);
  const detailed = pairs.map((p) => {
    const a = funds.find((f) => f.schemeId === p.schemeIdA)!;
    const b = funds.find((f) => f.schemeId === p.schemeIdB)!;
    return { ...p, ...fundOverlap(a, b) };
  });
  return ok({ pairs: detailed });
}

export async function runGetPortfolioLookthrough(
  ctx: McpContext,
  input: { account?: string },
): Promise<ToolResult> {
  const funds = await buildOwnedFunds(ctx, input.account);
  const lt = portfolioLookthrough(funds);
  return ok({
    totalValueInr: lt.totalValueInr,
    bySector: lt.bySector,
    byMarketCap: lt.byMarketCap,
    bySecurity: lt.bySecurity,
  });
}

export async function runAnalyzeConcentration(
  ctx: McpContext,
  input: { account?: string },
): Promise<ToolResult> {
  const funds = await buildOwnedFunds(ctx, input.account);
  const c = portfolioConcentration(funds);
  return ok({
    topSecurities: c.topSecurities,
    singleStockMaxPct: c.singleStockMaxPct,
    topSectorPct: c.topSectorPct,
    hhi: c.hhi,
  });
}

export async function runDetectRedundancy(
  ctx: McpContext,
  input: { account?: string },
): Promise<ToolResult> {
  const funds = await buildOwnedFunds(ctx, input.account);
  const r = detectRedundancy(funds);
  return ok({
    highOverlapPairs: r.highOverlapPairs,
    overCrowdedCategories: r.overCrowdedCategories,
  });
}

export async function runCheckGoalFit(
  ctx: McpContext,
  input: {
    account?: string;
    horizonYears: number;
    riskTolerance: 'low' | 'medium' | 'high';
  },
): Promise<ToolResult> {
  const funds = await buildOwnedFunds(ctx, input.account);
  const fit = checkGoalFit(funds, {
    horizonYears: input.horizonYears,
    riskTolerance: input.riskTolerance,
  });
  return ok({ mismatches: fit.mismatches, summary: fit.summary });
}

export function registerInvestmentAnalysisTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_fund_fundamentals',
    {
      description:
        'Stored expense ratio, plan type, AUM, benchmark, and risk metrics for one owned scheme. ' +
        'Required `schemeId`. Returns an error if no fundamentals have been ingested yet.',
      inputSchema: { schemeId: z.number().int().positive() },
    },
    async (input) => runGetFundFundamentals(ctx, input),
  );

  server.registerTool(
    'get_portfolio_holdings_status',
    {
      description:
        'Coverage and staleness of stored fund holdings for each owned MF. Optional `account` filter. ' +
        'Use before overlap/concentration analysis to see which funds need refresh_fund_data.',
      inputSchema: { account: z.string().optional() },
    },
    async (input) => runGetPortfolioHoldingsStatus(ctx, input),
  );

  server.registerTool(
    'analyze_fund_overlap',
    {
      description:
        'Pairwise overlap between owned funds (Σ min weight). Optional `account` filter. ' +
        'Returns `overlapPct` per pair plus common securities.',
      inputSchema: { account: z.string().optional() },
    },
    async (input) => runAnalyzeFundOverlap(ctx, input),
  );

  server.registerTool(
    'get_portfolio_lookthrough',
    {
      description:
        'Value-weighted look-through sector, market-cap, and security roll-up across owned funds. ' +
        'Optional `account` filter. Money fields are INR (`Inr`); percentages are scaled (`Pct`).',
      inputSchema: { account: z.string().optional() },
    },
    async (input) => runGetPortfolioLookthrough(ctx, input),
  );

  server.registerTool(
    'analyze_concentration',
    {
      description:
        'Portfolio concentration: top securities, single-stock max %, top sector %, and HHI. ' +
        'Optional `account` filter. Percentages are scaled (`Pct`).',
      inputSchema: { account: z.string().optional() },
    },
    async (input) => runAnalyzeConcentration(ctx, input),
  );

  server.registerTool(
    'detect_redundancy',
    {
      description:
        'Detect high-overlap fund pairs and overcrowded asset-class categories among owned funds. ' +
        'Optional `account` filter.',
      inputSchema: { account: z.string().optional() },
    },
    async (input) => runDetectRedundancy(ctx, input),
  );

  server.registerTool(
    'check_goal_fit',
    {
      description:
        'Check owned funds against a stated horizon and risk tolerance. Required `horizonYears` and ' +
        '`riskTolerance` (low|medium|high). Optional `account` filter.',
      inputSchema: {
        account: z.string().optional(),
        horizonYears: z.number(),
        riskTolerance: z.enum(['low', 'medium', 'high']),
      },
    },
    async (input) => runCheckGoalFit(ctx, input),
  );
}
