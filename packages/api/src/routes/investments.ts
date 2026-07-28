import type { FastifyInstance } from 'fastify';
import {
  getPortfolioSummary,
  getPeriodReturns,
  getLatestNAV,
  getNAVForDate,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  type NavLookup,
  type Period,
} from '@myfinance/core';

const VALID_PERIODS: readonly Period[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'];

function isPeriod(value: string | undefined): value is Period {
  return value !== undefined && (VALID_PERIODS as readonly string[]).includes(value);
}

/**
 * NAV dependency built from the real core nav service. The domain code only
 * calls these when a scheme has a non-null amfi_code, so for schemes without an
 * amfi code (as seeded in tests) these are never invoked — no network in tests.
 */
const nav: NavLookup = {
  getNAVForDate: (amfiCode, date) => getNAVForDate(amfiCode, date),
  getLatestNAV: (amfiCode) => getLatestNAV(amfiCode),
};

function portfolioDeps(app: FastifyInstance) {
  return {
    txRepo: app.repos.txRepo,
    holdingsRepo: app.repos.holdingsRepo,
    nav,
  };
}

type ReturnsQuery = { period?: string };

export async function investmentRoutes(app: FastifyInstance): Promise<void> {
  // GET /investments/summary?account= — lifetime portfolio summary (optional account filter).
  app.get<{ Querystring: { account?: string } }>('/investments/summary', async (req) => {
    const filters = req.query.account ? { account: req.query.account } : undefined;
    const summary = await getPortfolioSummary(portfolioDeps(app), filters);
    return { data: summary };
  });

  // GET /investments/returns?period=1Y — period returns; invalid period -> 400.
  app.get<{ Querystring: ReturnsQuery }>('/investments/returns', async (req) => {
    const period = req.query.period;
    if (!isPeriod(period)) {
      const err = new Error(
        `Invalid period: ${String(period)}. Expected one of ${VALID_PERIODS.join(', ')}.`,
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const returns = await getPeriodReturns(
      {
        txRepo: app.repos.txRepo,
        schemeRepo: app.repos.schemeRepo,
        holdingsRepo: app.repos.holdingsRepo,
        nav,
      },
      { period },
    );
    return { data: returns };
  });

  // GET /investments/holdings?account&sortBy&sortOrder
  app.get<{ Querystring: { account?: string; sortBy?: string; sortOrder?: string } }>(
    '/investments/holdings',
    async (req) => {
      const { account, sortBy, sortOrder } = req.query;
      const filters = {
        ...(account ? { account } : {}),
        ...(sortBy ? { sortBy: sortBy as any } : {}),
        ...(sortOrder ? { sortOrder: sortOrder as any } : {}),
      };
      const holdings = await getHoldings(portfolioDeps(app), filters);
      return { data: holdings };
    },
  );

  // GET /investments/allocation?account
  app.get<{ Querystring: { account?: string } }>('/investments/allocation', async (req) => {
    const filters = req.query.account ? { account: req.query.account } : undefined;
    const allocation = await getAssetAllocation(portfolioDeps(app), filters);
    return { data: allocation };
  });

  // GET /investments/accounts — MF transaction names ∪ manual investment account labels
  app.get('/investments/accounts', async () => {
    const mf = getAccounts({ txRepo: app.repos.txRepo });
    const manual = app.repos.accountRepo
      .list({ domain: 'investment' })
      .map((a) => a.label);
    const data = [...new Set([...mf, ...manual])].sort((a, b) => a.localeCompare(b));
    return { data };
  });
}
