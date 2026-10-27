import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { getPeriodReturns } from '../../src/domain/returns';
import { getPortfolioSummary } from '../../src/domain/portfolio';

// C1 regression: a CAS-only account has transactions but NO holdings snapshot rows.
// Period returns must still value the portfolio (was ~0% / ~0 XIRR).
describe('period returns for a CAS-only account (no holdings rows)', () => {
  it('ALL and 1Y returns are non-zero (valued from transactions)', async () => {
    const { db, sqlite } = runMigrations(':memory:');
    const schemeRepo = makeSchemeRepo(db), txRepo = makeInvestmentTxRepo(db), holdingsRepo = makeHoldingsRepo(db);
    const id = schemeRepo.createScheme({ schemeName: 'Nova Flexi', isin: 'INF000000001', amfiCode: '999', category: 'equity' });
    for (const [d, n] of [['2024-01-05', 10], ['2024-06-05', 12], ['2025-01-06', 15]] as const)
      txRepo.insert({ schemeId: id, schemeName: 'Nova Flexi', accountName: 'A', investmentApp: 'CAS', transactionType: 'PURCHASE', units: 100, nav: n, amount: 100 * n, transactionDate: d });
    const nav = { getLatestNAV: async () => 20, getNAVForDate: async (_c: string, date: string) => ({ nav: date < '2024-06-05' ? 10 : date < '2025-01-06' ? 12 : date < '2026-01-01' ? 15 : 20, date }) } as never;
    const today = new Date('2026-10-26T12:00:00');

    const all = await getPeriodReturns({ txRepo, schemeRepo, holdingsRepo, nav }, { period: 'ALL', today } as never);
    const oneY = await getPeriodReturns({ txRepo, schemeRepo, holdingsRepo, nav }, { period: '1Y', today } as never);
    const summary = await getPortfolioSummary({ txRepo, nav } as never, {}, today);

    expect(all.returnsPercent).toBeGreaterThan(20);
    expect(all.xirr).toBeGreaterThan(0.1);
    // NOTE: period-ALL xirr is not asserted equal to the summary xirr: the frozen
    // period math counts the first-day purchase in both startValue and cash flows.
    expect(summary.xirr).toBeGreaterThan(0.1);
    // 1Y window (no flows): value 4500 -> 6000 = +33.3%, xirr ~ 0.333
    expect(oneY.returnsPercent).toBeCloseTo(33.33, 1);
    expect(oneY.xirr).toBeCloseTo(0.3333, 2);
    sqlite.close();
  });
});
