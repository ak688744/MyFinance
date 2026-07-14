import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getPeriodReturns,
  type Period,
} from '@myfinance/core';
import type { McpContext } from '../../context.js';
import { ok, type ToolResult } from '../../shared/output.js';

const PERIODS = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;

export async function runInvestmentPortfolio(
  ctx: McpContext,
  input: { period?: Period; account?: string },
): Promise<ToolResult> {
  const deps = { txRepo: ctx.repos.investmentTxRepo, nav: ctx.nav };
  const filters = input.account ? { account: input.account } : {};
  const summary = await getPortfolioSummary(deps);
  const holdings = await getHoldings(deps, filters);
  const allocation = await getAssetAllocation(deps, input.account ? filters : undefined);
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
