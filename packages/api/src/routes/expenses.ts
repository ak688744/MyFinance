import type { FastifyInstance } from 'fastify';
import type { Gateway } from '../plugins/gateway';
import { getTriagedInsights } from '../lib/insightsService';
import { badRequest, notFound } from '../errors';

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

export async function expenseRoutes(app: FastifyInstance, opts: { gateway: Gateway }): Promise<void> {
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

  // GET /expenses/insights?month=YYYY-MM — deterministic rules → semantic consolidation
  // → per-event LLM triage (cached by signature). A plain refresh serves cached
  // verdicts (no LLM, stable); answering a question re-triages only the touched event.
  app.get<{ Querystring: { month?: string } }>('/expenses/insights', async (req) => {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('month=YYYY-MM is required.');
    const data = await getTriagedInsights(app.repos, opts.gateway, month, req.log);
    return { data };
  });

  // POST /expenses/insights/resolve — apply a tapped option (tags + optional
  // categoryFix) OR free-text tags to the event's transactions. Writes are additive
  // (source='agent'); category fixes set source='manual'. Completing the data makes
  // the event self-heal: its signature changes → the card disappears on next load.
  app.post<{ Body: { transactionIds?: number[]; tags?: string[]; categoryFix?: string | null } }>(
    '/expenses/insights/resolve',
    async (req) => {
      const { transactionIds, tags, categoryFix } = req.body ?? {};
      if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        throw badRequest('transactionIds (non-empty) is required.');
      }
      const cleanTags = (tags ?? [])
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean);
      if (cleanTags.length === 0 && !categoryFix) {
        throw badRequest('Provide tags and/or categoryFix to apply.');
      }
      // Validate category fix against known categories.
      if (categoryFix) {
        const known = new Set(app.repos.categoryRepo.list().map((c) => c.id));
        if (!known.has(categoryFix)) throw badRequest(`Unknown categoryId "${categoryFix}".`);
      }

      let applied = 0;
      for (const id of transactionIds) {
        const txn = app.repos.expenseTxRepo.getById(id);
        if (!txn) throw notFound(`Transaction ${id} not found.`);
        if (cleanTags.length > 0) {
          app.repos.expenseTxRepo.addTags(id, cleanTags.map((tag) => ({ tag, source: 'agent' as const })));
        }
        if (categoryFix) {
          app.repos.expenseTxRepo.updateCategory(id, categoryFix, 'manual', null);
        }
        applied += 1;
      }
      return { data: { applied, tags: cleanTags, categoryFix: categoryFix ?? null } };
    },
  );
}
