// packages/mcp/src/tools/write/fundDetails.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

const DETAILS_MAX_AGE_DAYS = 30;
const DETAILS_RETENTION_DAYS = 90;

const ageDays = (sqliteTs: string) => (Date.now() - Date.parse(`${sqliteTs.replace(' ', 'T')}Z`)) / 86_400_000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function runFetchFundDetails(ctx: McpContext, input: { code: string }): Promise<ToolResult> {
  const cached = ctx.repos.candidateDetailsRepo.get(input.code);
  if (cached && ageDays(cached.fetchedAt) <= DETAILS_MAX_AGE_DAYS) {
    return ok({ ...(JSON.parse(cached.detailsJson) as Record<string, unknown>), cached: true });
  }
  const name =
    ctx.repos.performanceUniverseRepo.getFund(input.code)?.schemeName ??
    ctx.repos.schemeRepo.getByAmfiCode(input.code)?.schemeName;
  if (!name) return errorResult(`Unknown AMFI code ${input.code}: not in the Direct-Growth universe or among owned funds.`);
  try {
    const d = await ctx.fundDetails.fetch(input.code, name);
    const payload = {
      amfiCode: input.code,
      schemeName: name,
      asOfDate: d.asOfDate,
      source: d.source,
      expenseRatioPct: d.fundamentals.expenseRatioDirect ?? d.fundamentals.expenseRatioRegular,
      planType: d.fundamentals.planType,
      aum: d.fundamentals.aum,
      benchmarkName: d.fundamentals.benchmarkName,
      stdDev: d.fundamentals.stdDev,
      sharpe: d.fundamentals.sharpe,
      beta: d.fundamentals.beta,
      alpha: d.fundamentals.alpha,
      topHoldings: [...d.holdings]
        .sort((a, b) => b.weightPct - a.weightPct)
        .slice(0, 10)
        .map((h) => ({ name: h.securityName, weightPct: h.weightPct, sector: h.sector })),
    };
    ctx.repos.candidateDetailsRepo.upsert({ amfiCode: input.code, detailsJson: JSON.stringify(payload) });
    ctx.repos.candidateDetailsRepo.pruneOlderThan(isoDaysAgo(DETAILS_RETENTION_DAYS));
    return ok({ ...payload, cached: false });
  } catch (e) {
    return errorResult(`Could not fetch details for ${input.code}: ${(e as Error)?.message ?? String(e)}`);
  }
}

export function registerFundDetailsTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'fetch_fund_details',
    {
      description:
        'Fetch (and cache for 30 days) deep details for any fund by AMFI code, owned or a candidate: expense ratio (percent), plan type, AUM as reported by the source, ' +
        'benchmark, risk stats and top 10 holdings. Use before comparing a candidate with an owned fund (e.g. to check overlap or cost).',
      inputSchema: { code: z.string() },
    },
    async (input) => runFetchFundDetails(ctx, input),
  );
}
