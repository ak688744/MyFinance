import type { FastifyInstance } from 'fastify';
import {
  getNetWorth,
  getNetWorthHistory,
  getHoldings,
  getLatestNAV,
  getNAVForDate,
  type NavLookup,
} from '@myfinance/core';

const nav: NavLookup = {
  getNAVForDate: (code, date) => getNAVForDate(code, date),
  getLatestNAV: (code) => getLatestNAV(code),
};

export async function networthRoutes(app: FastifyInstance): Promise<void> {
  const deps = () => ({
    assetRepo: app.repos.assetRepo,
    contributionRepo: app.repos.assetContributionRepo,
    rateRepo: app.repos.assetRateRepo,
    valuationRepo: app.repos.assetValuationRepo,
    liabilityRepo: app.repos.liabilityRepo,
    getMfHoldings: (filters: { account?: string }) =>
      getHoldings({ txRepo: app.repos.txRepo, nav }, filters),
  });

  app.get('/networth', async () => {
    const data = await getNetWorth(deps());
    return { data };
  });

  // History (stretch): comma-separated ISO dates via ?dates=2025-01-01,2025-02-01.
  // mfValueAt is omitted here (MF historical NAV wiring is the documented stretch);
  // computed/manual/liability history is exact.
  app.get<{ Querystring: { dates?: string } }>('/networth/history', async (req) => {
    const dates = (req.query.dates ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    const data = await getNetWorthHistory(deps(), { dates });
    return { data };
  });
}
