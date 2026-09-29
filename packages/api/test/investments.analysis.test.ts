import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';
import type { FundData } from '../src/routes/investments';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

const stubFundData: FundData = async (amfiCode) => ({
  schemeId: 1,
  source: 'groww',
  asOfDate: '2026-08-31',
  holdingsCount: 2,
});

function seedScheme(app: FastifyInstance) {
  app.sqlite
    .prepare(
      `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category)
       VALUES (1, 'Fund A', '100001', 'AMC', 'equity')`,
    )
    .run();
  app.sqlite
    .prepare(
      `INSERT INTO investment_transactions
        (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
       VALUES (1, 'acct', 'groww', 'Fund A', 'PURCHASE', 10, 100, 10000, '2024-01-01')`,
    )
    .run();
}

describe('investment analysis + fund-data routes', () => {
  it('POST /investments/fund-data/refresh stores holdings via injected fundData', async () => {
    const ingestCalls: string[] = [];
    const fundData: FundData = async (amfiCode) => {
      ingestCalls.push(amfiCode);
      app.repos.schemeHoldingsRepo.replaceSnapshot(1, '2026-08-31', [
        {
          securityName: 'HDFC Bank',
          isin: null,
          weightPct: 50,
          sector: 'Financials',
          marketCapBucket: 'large',
        },
      ]);
      return {
        schemeId: 1,
        source: 'groww',
        asOfDate: '2026-08-31',
        holdingsCount: 1,
      };
    };

    app = await buildTestServer({ fundData });
    seedScheme(app);

    const r = await app.inject({
      method: 'POST',
      url: '/investments/fund-data/refresh',
      payload: { amfiCode: '100001' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.holdingsCount).toBe(1);
    expect(ingestCalls).toEqual(['100001']);
    expect(app.repos.schemeHoldingsRepo.getLatestSnapshot(1)).toHaveLength(1);
  });

  it('returns 400 when refresh body lacks amfiCode and all', async () => {
    app = await buildTestServer({ fundData: stubFundData });
    const r = await app.inject({
      method: 'POST',
      url: '/investments/fund-data/refresh',
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /investments/fund-data/coverage lists owned funds', async () => {
    app = await buildTestServer({ fundData: stubFundData });
    seedScheme(app);

    const r = await app.inject({ method: 'GET', url: '/investments/fund-data/coverage' });
    expect(r.statusCode).toBe(200);
    const rows = r.json().data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].schemeName).toBe('Fund A');
  });

  it('GET /investments/analysis/insights returns insight cards', async () => {
    app = await buildTestServer({ fundData: stubFundData });
    seedScheme(app);

    const r = await app.inject({ method: 'GET', url: '/investments/analysis/insights' });
    expect(r.statusCode).toBe(200);
    const insights = r.json().data as any[];
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.some((i) => i.kind === ('stale_data' as string))).toBe(false);
  });

  it('GET /investments/analysis/overlap returns pairs array', async () => {
    app = await buildTestServer({ fundData: stubFundData });
    seedScheme(app);
    app.sqlite
      .prepare(
        `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category)
         VALUES (2, 'Fund B', '100002', 'AMC', 'equity')`,
      )
      .run();
    app.sqlite
      .prepare(
        `INSERT INTO investment_transactions
          (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
         VALUES (2, 'acct', 'groww', 'Fund B', 'PURCHASE', 5, 100, 5000, '2024-01-01')`,
      )
      .run();
    app.repos.schemeHoldingsRepo.replaceSnapshot(1, '2026-08-31', [
      { securityName: 'HDFC', isin: null, weightPct: 50, sector: null, marketCapBucket: null },
    ]);
    app.repos.schemeHoldingsRepo.replaceSnapshot(2, '2026-08-31', [
      { securityName: 'HDFC', isin: null, weightPct: 40, sector: null, marketCapBucket: null },
    ]);

    const r = await app.inject({ method: 'GET', url: '/investments/analysis/overlap' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toHaveLength(1);
  });
});
