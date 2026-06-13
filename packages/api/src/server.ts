// packages/api/src/server.ts
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { loadConfig } from './config';
import { registerErrorHandler } from './errors';
import { registerDb } from './plugins/db';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { investmentRoutes } from './routes/investments';
import { importRoutes, type AmfiMatch } from './routes/imports';
// import { categoryRoutes } from './routes/categories'; // Task 7

export type BuildServerOpts = {
  dbPath?: string;
  /**
   * Post-import AMFI auto-match injected into the holdings import. Defaults to
   * the real network matcher (core). Tests pass a no-network stub.
   */
  amfiMatch?: AmfiMatch;
};

/**
 * Build (but do NOT listen) a fully-wired Fastify instance: error handler,
 * DB + repos decoration, multipart, and the routes. Tests import this and use
 * `app.inject()`; the entrypoint block below calls `listen` for real runs.
 */
export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const dbPath = opts.dbPath ?? loadConfig().dbPath;

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
  await app.register(investmentRoutes);
  // await app.register(categoryRoutes); // Task 7
  await app.register(importRoutes, { amfiMatch: opts.amfiMatch });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}
