import type { FastifyInstance } from 'fastify';
import { computeExpenseInsights, LOOKBACK_MONTHS } from '@myfinance/core';
import { deriveMerchantName } from '../lib/deriveMerchantName';
import { badRequest } from '../errors';

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
const DEFAULT_EXCLUDE_FROM_SPEND = ['investment', 'self_transfer'];
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

  app.get<{ Querystring: { month?: string } }>('/expenses/insights', async (req) => {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('month=YYYY-MM is required.');

    const [y, m] = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    // prior LOOKBACK_MONTHS window
    const priorStartDate = new Date(Date.UTC(y, m - 1 - LOOKBACK_MONTHS, 1));
    const priorStart = `${priorStartDate.getUTCFullYear()}-${String(priorStartDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const priorEnd = `${month}-01`; // exclusive-ish; prior rows are < monthStart

    const monthTxns = app.repos.expenseTxRepo.query({ from: monthStart, to: monthEnd });
    const priorAll = app.repos.expenseTxRepo.query({ from: priorStart, to: monthStart });
    const priorTxns = priorAll.filter((t) => t.transactionDate < monthStart);

    const thisMonthSummary = app.repos.expenseTxRepo.summary({ from: monthStart, to: monthEnd });
    // prior byCategory per month: one summary per prior month keeps it simple + correct.
    const byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[] = [];
    for (let k = 1; k <= LOOKBACK_MONTHS; k += 1) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1));
      const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const s = app.repos.expenseTxRepo.summary({ from: `${mm}-01`, to: `${mm}-31` });
      for (const c of s.byCategory) byCategoryPriorMonths.push({ month: mm, categoryId: c.categoryId, amount: c.amount });
    }

    const toInsightTxn = (t: (typeof monthTxns)[number]) => ({
      id: t.id, transactionDate: t.transactionDate, description: t.description, amount: t.amount,
      direction: t.direction, categoryId: t.categoryId, tags: t.tags,
    });

    const data = computeExpenseInsights({
      month,
      monthTxns: monthTxns.map(toInsightTxn),
      priorTxns: priorTxns.map(toInsightTxn),
      byCategoryThisMonth: thisMonthSummary.byCategory,
      byCategoryPriorMonths,
      deriveMerchantName,
    });
    return { data };
  });
}
