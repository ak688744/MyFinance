import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runListCategories(ctx: McpContext): Promise<ToolResult> {
  const categories = ctx.repos.categoryRepo.list().map((c) => ({ id: c.id, name: c.name }));
  return ok({ categories });
}

export function registerCategoriesReadTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_categories',
    {
      description: 'List all expense categories (id + name). Use these ids when categorizing transactions.',
      inputSchema: {},
    },
    async () => runListCategories(ctx),
  );
}
