#!/usr/bin/env node
// Runs via tsx (see package.json "start": "tsx src/index.ts") — the same
// run-TypeScript-directly convention the API uses (`tsx src/server.ts`). The
// monorepo is never compiled to JS; core is consumed from source, so relative
// imports here stay extensionless like every other file in the package.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildContext } from './context';
import { buildServer } from './server';

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
