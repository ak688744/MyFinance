import type { FastifyInstance } from 'fastify';

export async function aiUsageRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { from?: string; to?: string } }>('/ai/usage/summary', async (req) =>
    ({ data: app.repos.aiUsageRepo.summary({ from: req.query.from, to: req.query.to }) }));

  app.get<{ Querystring: { from?: string; to?: string; task?: string; limit?: string; offset?: string } }>(
    '/ai/usage/events', async (req) => ({
      data: app.repos.aiUsageRepo.listEvents({
        from: req.query.from, to: req.query.to, task: req.query.task,
        limit: Math.min(Number(req.query.limit ?? 50), 500), offset: Number(req.query.offset ?? 0),
      }),
    }));
}
