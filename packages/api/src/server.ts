// packages/api/src/server.ts
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { loadConfig } from './config';
import { registerErrorHandler } from './errors';
import { registerDb } from './plugins/db';
import { makeGateway, type Gateway } from './plugins/gateway';
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
import { aiSettingsRoutes } from './routes/aiSettings';
import { aiUsageRoutes } from './routes/aiUsage';
import { agentRoutes } from './routes/agent';
import { makeHarness, memoryUrlFor, type Harness } from './plugins/harness';

export type BuildServerOpts = {
  dbPath?: string;
  /**
   * Post-import AMFI auto-match injected into the holdings import. Defaults to
   * the real network matcher (core). Tests pass a no-network stub.
   */
  amfiMatch?: AmfiMatch;
  /** Injected LLM gateway (tests pass a fake). Falls back to real gateway. */
  gateway?: Gateway;
  /** Injected wealth-agent harness (tests pass a fake). Falls back to real harness. */
  harness?: Harness;
  /**
   * Fastify logger option. Defaults to `true` (request logging on) for real runs;
   * tests pass `false` to keep output quiet.
   */
  logger?: boolean;
};

/**
 * Build (but do NOT listen) a fully-wired Fastify instance: error handler,
 * DB + repos decoration, multipart, and the routes. Tests import this and use
 * `app.inject()`; the entrypoint block below calls `listen` for real runs.
 */
export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const cfg = loadConfig();
  const dbPath = opts.dbPath ?? cfg.dbPath;

  // Logger on by default for real runs; quiet under Vitest so test output stays clean.
  // Explicit opts.logger always wins.
  const app = Fastify({ logger: opts.logger ?? !process.env.VITEST });

  registerErrorHandler(app);

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  // Decorate the instance with db/sqlite/repos. Done directly (not via
  // app.register) so the decorations live on the root instance, not an
  // encapsulated child scope.
  await registerDb(app, dbPath);

  const gateway: Gateway = opts.gateway ?? makeGateway(app.repos);

  const harness: Harness = opts.harness ?? makeHarness(app.repos, { dbPath, memoryUrl: memoryUrlFor(dbPath) });

  await app.register(healthRoutes);
  await app.register(transactionRoutes);
  await app.register(expenseRoutes);
  await app.register(investmentRoutes);
  await app.register(categoryRoutes, { gateway });
  await app.register(importRoutes, { amfiMatch: opts.amfiMatch });
  await app.register(accountRoutes);
  await app.register(liabilityRoutes);
  await app.register(assetRoutes);
  await app.register(networthRoutes);
  // AI routes (Tasks 15/16):
  await app.register(aiSettingsRoutes);
  await app.register(aiUsageRoutes);
  await app.register(agentRoutes, { harness });

  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await buildServer();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}
