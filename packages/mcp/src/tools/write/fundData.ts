import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

export async function runRefreshFundData(
  ctx: McpContext,
  input: { schemeId?: number; amfiCode?: string; source?: 'groww' | 'tickertape' | 'kuvera' },
): Promise<ToolResult> {
  // Resolve the AMFI code from the schemeId when given (preferred — the agent
  // gets schemeId from get_portfolio_holdings_status and must NOT guess codes).
  let amfiCode = input.amfiCode ?? null;
  if (input.schemeId != null) {
    const scheme = ctx.repos.schemeRepo.getSchemeById(input.schemeId);
    if (!scheme) return errorResult(`Scheme ${input.schemeId} not found.`);
    if (!scheme.amfiCode) {
      return errorResult(
        `Scheme ${input.schemeId} (${scheme.schemeName}) has no AMFI code, so fund data cannot be fetched. Skip it.`,
      );
    }
    amfiCode = scheme.amfiCode;
  }
  if (!amfiCode) {
    return errorResult('Provide a schemeId (preferred) or an amfiCode.');
  }

  try {
    const opts = input.source ? { source: input.source } : {};
    const r = await ctx.fundData.ingest(amfiCode, opts);
    return ok({ ...r });
  } catch (err) {
    return errorResult(
      `Fund-data refresh failed for ${amfiCode}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function registerFundDataWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'refresh_fund_data',
    {
      description:
        'Fetch and store the latest holdings + fundamentals for one owned mutual fund from ' +
        'unofficial platform JSON. Prefer passing `schemeId` (from get_portfolio_holdings_status) — ' +
        'the tool resolves the stored AMFI code itself; do NOT guess an `amfiCode`. Funds whose ' +
        'coverage shows refreshable=false (no AMFI code) cannot be fetched — skip them. Optional ' +
        '`source`. On source outage / a fund not carried by the source, returns an error result.',
      inputSchema: {
        schemeId: z.number().int().positive().optional(),
        amfiCode: z.string().min(1).optional(),
        source: z.enum(['groww', 'tickertape', 'kuvera']).optional(),
      },
    },
    async (input) => runRefreshFundData(ctx, input),
  );
}
