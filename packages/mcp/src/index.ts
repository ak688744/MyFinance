#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildContext } from './context.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  // DB path from env (same var the API uses); falls back to a local file.
  const dbPath = process.env.DB_PATH ?? 'myfinance.db';
  const ctx = buildContext({ dbPath });
  const server = buildServer(ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean shutdown: close sqlite when the transport/stdin ends.
  const shutdown = (): void => {
    ctx.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // stderr only — stdout is the MCP channel and must stay protocol-clean.
  process.stderr.write(`myfinance-mcp failed to start: ${String(err)}\n`);
  process.exit(1);
});
