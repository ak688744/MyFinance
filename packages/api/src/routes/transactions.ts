import type { FastifyInstance } from 'fastify';

type TransactionsQuery = {
  limit?: string;
  offset?: string;
  categoryId?: string;
};

/**
 * GET /transactions — paginated expense transactions.
 * Query: limit (default 50), offset (default 0), categoryId (optional).
 * Returns { data: rows }.
 */
export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: TransactionsQuery }>('/transactions', async (req) => {
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    const categoryId = req.query.categoryId;

    const rows = app.repos.expenseTxRepo.list({ limit, offset, categoryId });
    return { data: rows };
  });
}
