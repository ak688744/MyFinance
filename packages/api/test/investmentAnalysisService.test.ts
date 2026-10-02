import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';
import {
  getFundDataCoverage,
  getInvestmentInsights,
  buildOwnedFunds,
} from '../src/lib/investmentAnalysisService';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function seedOwnedScheme(app: FastifyInstance, id: number, name: string, invested: number) {
  app.sqlite
    .prepare(
      `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category)
       VALUES (?, ?, ?, 'AMC', 'equity')`,
    )
    .run(id, name, `10000${id}`);
  app.sqlite
    .prepare(
      `INSERT INTO investment_transactions
        (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
       VALUES (?, 'acct', 'groww', ?, 'PURCHASE', 10, 100, ?, '2024-01-01')`,
    )
    .run(id, name, invested);
}

describe('investmentAnalysisService', () => {
  it('reports coverage (refreshable, no holdings) and raises no stale card', async () => {
    app = await buildTestServer();
    seedOwnedScheme(app, 1, 'Fund A', 10000);

    const coverage = await getFundDataCoverage(app.repos);
    expect(coverage).toHaveLength(1);
    expect(coverage[0].hasHoldings).toBe(false);
    expect(coverage[0].refreshable).toBe(true);
    expect(coverage[0].ageDays).toBeNull();

    const insights = await getInvestmentInsights(app.repos);
    expect(insights.map((i) => i.kind)).toEqual(['portfolio_profile']);
  });

  it('returns overlap insight when two funds share holdings', async () => {
    app = await buildTestServer();
    seedOwnedScheme(app, 1, 'Fund A', 10000);
    seedOwnedScheme(app, 2, 'Fund B', 10000);

    app.repos.schemeHoldingsRepo.replaceSnapshot(1, '2026-08-31', [
      {
        securityName: 'HDFC Bank',
        isin: null,
        weightPct: 60,
        sector: 'Financials',
        marketCapBucket: 'large',
      },
      { securityName: 'Reliance', isin: null, weightPct: 10, sector: null, marketCapBucket: null },
    ]);
    app.repos.schemeHoldingsRepo.replaceSnapshot(2, '2026-08-31', [
      {
        securityName: 'HDFC Bank',
        isin: null,
        weightPct: 55,
        sector: 'Financials',
        marketCapBucket: 'large',
      },
      { securityName: 'Infosys', isin: null, weightPct: 15, sector: null, marketCapBucket: null },
    ]);

    const funds = await buildOwnedFunds(app.repos);
    expect(funds).toHaveLength(2);

    const insights = await getInvestmentInsights(app.repos);
    expect(insights.some((i) => i.kind === 'high_overlap')).toBe(true);
  });
});
