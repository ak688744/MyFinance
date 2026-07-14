import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';

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

  // Tool registrations are added by Tasks 5–10, e.g.:
  //   registerNetworthTools(server, ctx);
  // (ctx is intentionally referenced to avoid an unused-parameter error until
  // the first tool lands in Task 5.)
  void ctx;

  return server;
}
