import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getPortfolioSummaryForPeriod,
  getHoldingsForPeriod,
  getPeriodReturns,
  type Period,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

const PERIODS = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;

export async function runInvestmentPortfolio(
  ctx: McpContext,
  input: { period?: Period; account?: string },
): Promise<ToolResult> {
  const deps = { txRepo: ctx.repos.investmentTxRepo, nav: ctx.nav };
  const filters = input.account ? { account: input.account } : {};

  // Branch on period: undefined or 'ALL' = lifetime, otherwise use ForPeriod functions
  const isLifetime = !input.period || input.period === 'ALL';

  let summary, holdings, allocation;

  if (isLifetime) {
    // Lifetime path: apply account filter to all three calls (fixes I1)
    summary = await getPortfolioSummary(deps, filters);
    holdings = await getHoldings(deps, filters);
    allocation = await getAssetAllocation(deps, input.account ? filters : undefined);
  } else {
    // Windowed period path: use ForPeriod functions (fixes I2)
    // Type assertion safe: isLifetime checks input.period is truthy and not 'ALL'
    const period = input.period as Period;
    summary = await getPortfolioSummaryForPeriod(deps, {
      period,
      account: input.account,
    });
    holdings = await getHoldingsForPeriod(deps, {
      period,
      account: input.account,
    });
    // No ForPeriod allocation function exists; keep lifetime allocation
    // (allocation is a current-composition view, reasonably lifetime)
    allocation = await getAssetAllocation(deps, input.account ? filters : undefined);
  }

  return ok({
    summary: {
      investedInr: summary.totalInvested,
      currentValueInr: summary.totalCurrentValue,
      returnsInr: summary.totalReturns,
      returnsPercent: summary.totalReturnsPercent,
      xirrFraction: summary.xirr,
    },
    holdings,
    allocation,
  });
}

export async function runInvestmentReturns(
  ctx: McpContext,
  input: { period: Period },
): Promise<ToolResult> {
  const r = await getPeriodReturns(
    {
      txRepo: ctx.repos.investmentTxRepo,
      schemeRepo: ctx.repos.schemeRepo,
      holdingsRepo: ctx.repos.holdingsRepo,
      nav: ctx.nav,
    },
    { period: input.period },
  );
  return ok({
    period: r.period,
    startDate: r.startDate,
    endDate: r.endDate,
    startValueInr: r.startValue,
    endValueInr: r.endValue,
    investedInPeriodInr: r.investedInPeriod,
    returnsInr: r.returns,
    returnsPercent: r.returnsPercent,
    xirrFraction: r.xirr,
  });
}

export function registerInvestmentTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_investment_portfolio',
    {
      description:
        'Mutual-fund portfolio: summary (invested / current value / returns / XIRR), ' +
        'per-holding rows, and asset allocation. Optional `period` (1M/3M/6M/1Y/3Y/5Y/ALL, ' +
        'default ALL) and `account` (account-NAME string). Money fields are INR (`Inr`); ' +
        '`xirrFraction` is a raw fraction (0.0949 = 9.49%).',
      inputSchema: {
        period: z.enum(PERIODS).optional(),
        account: z.string().optional(),
      },
    },
    async (input) => runInvestmentPortfolio(ctx, input),
  );

  server.registerTool(
    'get_investment_returns',
    {
      description:
        'Period returns for the MF portfolio over the given window. Required `period` ' +
        '(1M/3M/6M/1Y/3Y/5Y/ALL). Money fields are INR (`Inr`); `xirrFraction` is a raw ' +
        'fraction (0.0949 = 9.49%).',
      inputSchema: { period: z.enum(PERIODS) },
    },
    async (input) => runInvestmentReturns(ctx, input),
  );
}
