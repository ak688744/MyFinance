import type { FastifyInstance } from 'fastify';

type ExpenseQuery = {
  from?: string; to?: string; direction?: string; search?: string;
  categoryId?: string; accountId?: string; limit?: string; offset?: string;
};

type SummaryQuery = { from?: string; to?: string; accountId?: string };

export async function expenseRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ExpenseQuery }>('/expenses', async (req) => {
    const q = req.query;
    const data = app.repos.expenseTxRepo.query({
      ...(q.from ? { from: q.from } : {}),
      ...(q.to ? { to: q.to } : {}),
      ...(q.direction === 'in' || q.direction === 'out' ? { direction: q.direction } : {}),
      ...(q.search ? { search: q.search } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.accountId ? { accountId: Number(q.accountId) } : {}),
      ...(q.limit ? { limit: Number(q.limit) } : {}),
      ...(q.offset ? { offset: Number(q.offset) } : {}),
    });
    return { data };
  });

  app.get<{ Querystring: SummaryQuery }>('/expenses/summary', async (req) => {
    const q = req.query;
    const data = app.repos.expenseTxRepo.summary({
      ...(q.from ? { from: q.from } : {}),
      ...(q.to ? { to: q.to } : {}),
      ...(q.accountId ? { accountId: Number(q.accountId) } : {}),
    });
    return { data };
  });
}
