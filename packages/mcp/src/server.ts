import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerNetworthTools } from './tools/read/networth';
import { registerInvestmentTools } from './tools/read/investments';
import { registerExpenseTools } from './tools/read/expenses';
import { registerLoanTools } from './tools/read/loans';
import { registerAccountTools } from './tools/read/accounts';
import { registerMarketTools } from './tools/read/market';
import { registerTransactionWriteTools } from './tools/write/transactions';
import { registerCategoryWriteTools } from './tools/write/categories';
import { registerAccountWriteTools } from './tools/write/accounts';
import { registerAssetWriteTools } from './tools/write/assets';
import { registerLiabilityWriteTools } from './tools/write/liabilities';

/**
 * Build the MyFinance MCP server and register all read + write tools.
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
  registerAccountTools(server, ctx);
  registerMarketTools(server, ctx);

  registerTransactionWriteTools(server, ctx);
  registerCategoryWriteTools(server, ctx);
  registerAccountWriteTools(server, ctx);
  registerAssetWriteTools(server, ctx);
  registerLiabilityWriteTools(server, ctx);

  return server;
}
