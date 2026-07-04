// packages/api/src/server.ts
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { loadConfig } from './config';
import { registerErrorHandler } from './errors';
import { registerDb } from './plugins/db';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { expenseRoutes } from './routes/expenses';
import { investmentRoutes } from './routes/investments';
import { importRoutes, type AmfiMatch } from './routes/imports';
import { categoryRoutes } from './routes/categories';
import { accountRoutes } from './routes/accounts';
import { liabilityRoutes } from './routes/liabilities';
import { assetRoutes } from './routes/assets';
import { networthRoutes } from './routes/networth';
import { resolveProvider, type LlmProvider } from '@myfinance/agents';

export type BuildServerOpts = {
  dbPath?: string;
  /**
   * Post-import AMFI auto-match injected into the holdings import. Defaults to
   * the real network matcher (core). Tests pass a no-network stub.
   */
  amfiMatch?: AmfiMatch;
  /** Injected categorization LLM provider (tests pass a fake). Falls back to config. */
  llmProvider?: LlmProvider;
};

/**
 * Build (but do NOT listen) a fully-wired Fastify instance: error handler,
 * DB + repos decoration, multipart, and the routes. Tests import this and use
 * `app.inject()`; the entrypoint block below calls `listen` for real runs.
 */
export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const cfg = loadConfig();
  const dbPath = opts.dbPath ?? cfg.dbPath;
  const categorizationProvider: LlmProvider | null =
    opts.llmProvider ?? (cfg.llm.categorization ? resolveProvider(cfg.llm.categorization) : null);

  const app = Fastify({ logger: false });

  registerErrorHandler(app);

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  // Decorate the instance with db/sqlite/repos. Done directly (not via
  // app.register) so the decorations live on the root instance, not an
  // encapsulated child scope.
  await registerDb(app, dbPath);

  await app.register(healthRoutes);
  await app.register(transactionRoutes);
  await app.register(expenseRoutes);
  await app.register(investmentRoutes);
  await app.register(categoryRoutes, { llmProvider: categorizationProvider });
  await app.register(importRoutes, { amfiMatch: opts.amfiMatch });
  await app.register(accountRoutes);
  await app.register(liabilityRoutes);
  await app.register(assetRoutes);
  await app.register(networthRoutes);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}
