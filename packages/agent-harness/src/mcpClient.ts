import { MCPClient } from '@mastra/mcp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MCP_ENTRY = resolve(__dirname, '../../mcp/src/index.ts');
const TSX_BIN = resolve(__dirname, '../node_modules/.bin/tsx');

export function buildFinanceMcpClient(opts: { dbPath: string; mcpEntry?: string }): MCPClient {
  const entry = opts.mcpEntry ?? DEFAULT_MCP_ENTRY;
  return new MCPClient({
    id: `finance-mcp-${opts.dbPath}`,
    servers: {
      finance: {
        command: TSX_BIN,
        args: [entry],
        env: { DB_PATH: opts.dbPath },
      },
    },
    timeout: 30000,
  } as any);
}

export async function getFinanceTools(client: MCPClient): Promise<Record<string, unknown>> {
  return (await client.listTools()) as Record<string, unknown>;
}
