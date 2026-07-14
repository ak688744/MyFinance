import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerNetworthTools } from './tools/read/networth';
import { registerInvestmentTools } from './tools/read/investments';
import { registerExpenseTools } from './tools/read/expenses';
import { registerLoanTools } from './tools/read/loans';

/**
 * Build the MyFinance MCP server and register all read tools.
 * Transport-agnostic: the caller connects a transport (stdio in index.ts,
 * in-memory in tests).
 */
export function buildServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: 'myfinance-mcp',
    version: '0.0.0',
  });

  registerNetworthTools(server, ctx);
  registerInvestmentTools(server, ctx);
  registerExpenseTools(server, ctx);
  registerLoanTools(server, ctx);

  return server;
}
