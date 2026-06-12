import type { FastifyInstance } from 'fastify';

/**
 * GET /health — confirms DB connectivity with a trivial SELECT 1.
 * Returns { data: { status: 'ok', db: true } } on success; db:false if the
 * probe query throws.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    let db = false;
    try {
      app.sqlite.prepare('SELECT 1').get();
      db = true;
    } catch {
      db = false;
    }
    return { data: { status: 'ok', db } };
  });
}
