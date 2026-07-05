import type { FastifyInstance } from 'fastify';

type ExpenseQuery = {
  from?: string; to?: string; direction?: string; search?: string;
  categoryId?: string; accountId?: string; limit?: string; offset?: string;
};

type SummaryQuery = {
  from?: string; to?: string; accountId?: string;
  excludeFromSpend?: string; investmentCategories?: string;
};

// Categories that are money moved, not consumed: kept out of "spent". Investment
// debits are additionally surfaced as `invested`. Overridable via query params
// (comma-separated) for flexibility, but these single-user defaults match the
// app's starter categories.
const DEFAULT_EXCLUDE_FROM_SPEND = ['investment', 'transfer'];
const DEFAULT_INVESTMENT_CATEGORIES = ['investment'];

function parseCsv(v: string | undefined, fallback: string[]): string[] {
  if (v === undefined) return fallback;
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  return parts; // explicit empty string => [] (opt out of exclusions)
}

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
      excludeFromSpend: parseCsv(q.excludeFromSpend, DEFAULT_EXCLUDE_FROM_SPEND),
      investmentCategories: parseCsv(q.investmentCategories, DEFAULT_INVESTMENT_CATEGORIES),
    });
    return { data };
  });
}
