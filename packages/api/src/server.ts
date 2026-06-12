import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from './config';
import { registerErrorHandler } from './errors';
import { registerDb } from './plugins/db';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { investmentRoutes } from './routes/investments';

export type BuildServerOpts = {
  dbPath?: string;
};

/**
 * Build (but do NOT listen) a fully-wired Fastify instance: error handler,
 * DB + repos decoration, and the read-only routes. Tests import this and use
 * `app.inject()`; the entrypoint block below calls `listen` for real runs.
 */
export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const dbPath = opts.dbPath ?? loadConfig().dbPath;

  const app = Fastify({ logger: false });

  registerErrorHandler(app);

  // Decorate the instance with db/sqlite/repos. Done directly (not via
  // app.register) so the decorations live on the root instance, not an
  // encapsulated child scope.
  await registerDb(app, dbPath);

  await app.register(healthRoutes);
  await app.register(transactionRoutes);
  await app.register(investmentRoutes);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}
