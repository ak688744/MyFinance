import type { FastifyInstance } from 'fastify';
import {
  getPortfolioSummary,
  getPeriodReturns,
  getLatestNAV,
  getNAVForDate,
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

type ReturnsQuery = { period?: string };

export async function investmentRoutes(app: FastifyInstance): Promise<void> {
  // GET /investments/summary — lifetime portfolio summary.
  app.get('/investments/summary', async () => {
    const summary = await getPortfolioSummary({ txRepo: app.repos.txRepo, nav });
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
}
