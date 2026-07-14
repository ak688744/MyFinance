import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runListAccounts(
  ctx: McpContext,
  input: { domain?: 'investment' | 'expense' },
): Promise<ToolResult> {
  const accounts = ctx.repos.accountRepo.list(input.domain ? { domain: input.domain } : undefined);
  return ok({
    accounts: accounts.map((a) => ({
      id: a.id,
      institution: a.institution,
      label: a.label,
      domain: a.domain,
      assetClass: a.assetClass,
    })),
  });
}

export function registerAccountTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_accounts',
    {
      description:
        'List financial accounts. Optional `domain` filter ("investment" | "expense"). ' +
        'Returns id, institution, label, domain and assetClass for each account.',
      inputSchema: { domain: z.enum(['investment', 'expense']).optional() },
    },
    async (input) => runListAccounts(ctx, input),
  );
}
