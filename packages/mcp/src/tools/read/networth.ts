import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNetWorth, getAllAssets, getHoldings } from '@myfinance/core';
import type { McpContext } from '../../context.js';
import { ok, type ToolResult } from '../../shared/output.js';

function netWorthDeps(ctx: McpContext) {
  return {
    assetRepo: ctx.repos.assetRepo,
    contributionRepo: ctx.repos.assetContributionRepo,
    rateRepo: ctx.repos.assetRateRepo,
    valuationRepo: ctx.repos.assetValuationRepo,
    liabilityRepo: ctx.repos.liabilityRepo,
    getMfHoldings: (filters: { account?: string }) =>
      getHoldings({ txRepo: ctx.repos.investmentTxRepo, nav: ctx.nav }, filters),
  };
}

export async function runNetworthOverview(ctx: McpContext): Promise<ToolResult> {
  const deps = netWorthDeps(ctx);
  const summary = await getNetWorth(deps);
  const assets = await getAllAssets(deps);
  return ok({
    totalAssetsInr: summary.totalAssets,
    totalLiabilitiesInr: summary.totalLiabilities,
    netWorthInr: summary.netWorth,
    byAssetClass: summary.byAssetClass.map((c) => ({
      assetClass: c.assetClass,
      valueInr: c.value,
      percentage: c.percentage,
      count: c.count,
    })),
    assets: assets.map((a) => ({
      assetId: a.assetId,
      assetClass: a.assetClass,
      name: a.name,
      valuationStrategy: a.valuationStrategy,
      currentValueInr: a.currentValue,
      investedInr: a.invested,
      returnsInr: a.returns,
      asOf: a.asOf,
    })),
  });
}

export function registerNetworthTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_networth_overview',
    {
      description:
        'Total net worth: assets minus liabilities, with a per-asset-class breakdown ' +
        'and every valued asset (mutual funds are projected in at read time). All ' +
        'monetary fields are INR (suffix `Inr`). Takes no input.',
      inputSchema: {},
    },
    async () => runNetworthOverview(ctx),
  );
}
