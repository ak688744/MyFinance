import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runCreateAccount(
  ctx: McpContext,
  input: { domain: 'investment' | 'expense'; institution: string; label: string; assetClass?: string | null },
): Promise<ToolResult> {
  const id = ctx.repos.accountRepo.ensureAccount({
    domain: input.domain,
    institution: input.institution,
    label: input.label,
    assetClass: input.assetClass ?? null,
  });
  return ok({ id });
}

export function registerAccountWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_account',
    {
      description: 'Create (or find) an account by `domain` ("investment"|"expense"), `institution`, and ' +
        '`label`. Idempotent — returns the existing account id if the triple already exists. Optional ' +
        '`assetClass`. Use before assigning transactions/assets to a new account.',
      inputSchema: {
        domain: z.enum(['investment', 'expense']),
        institution: z.string().min(1),
        label: z.string().min(1),
        assetClass: z.string().nullable().optional(),
      },
    },
    async (input) => runCreateAccount(ctx, input),
  );
}
