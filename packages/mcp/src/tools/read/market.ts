import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

export async function runSearchSchemes(
  ctx: McpContext,
  input: { query: string },
): Promise<ToolResult> {
  try {
    const results = await ctx.marketData.searchSchemes(input.query);
    return ok({
      schemes: results.map((s) => ({ amfiCode: s.amfiCode, schemeName: s.schemeName })),
    });
  } catch (err) {
    return errorResult(
      `Market data temporarily unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function runSchemeNav(
  ctx: McpContext,
  input: { amfiCode: string; history?: boolean },
): Promise<ToolResult> {
  try {
    const latest = await ctx.marketData.getLatestNAV(input.amfiCode);
    const payload: Record<string, unknown> = {
      amfiCode: input.amfiCode,
      latest: latest == null ? null : { navInr: latest, dateStr: null },
    };
    if (input.history) {
      // Fetch history from a far-back date to today
      const startDate = '2000-01-01';
      const endDate = new Date().toISOString().split('T')[0];
      const hist = await ctx.marketData.getNAVHistory(input.amfiCode, startDate, endDate);
      payload.history = hist.map((h) => ({ navInr: h.nav, dateStr: h.date }));
    }
    return ok(payload);
  } catch (err) {
    return errorResult(
      `Market data temporarily unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function registerMarketTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'search_schemes',
    {
      description:
        'Search mutual-fund schemes by name; returns matching { amfiCode, schemeName }. ' +
        'Required `query`. Hits an external market-data source — on outage returns an ' +
        'error result (transient).',
      inputSchema: { query: z.string().min(1) },
    },
    async (input) => runSearchSchemes(ctx, input),
  );

  server.registerTool(
    'get_scheme_nav',
    {
      description:
        'Latest NAV (and optional history) for a scheme by AMFI code. Required `amfiCode`; ' +
        'optional `history` (bool). `navInr` is the NAV in INR. External source — on outage ' +
        'returns an error result (transient).',
      inputSchema: {
        amfiCode: z.string().min(1),
        history: z.boolean().optional(),
      },
    },
    async (input) => runSchemeNav(ctx, input),
  );
}
