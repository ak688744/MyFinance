import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

describe('networth route', () => {
  it('GET /networth = assets − liabilities with per-class breakdown', async () => {
    app = await buildTestServer();
    const accountId = (await app.inject({
      method: 'POST', url: '/accounts',
      payload: { domain: 'investment', institution: 'SBI', label: 'PPF' },
    })).json().data.id;

    // manual gold worth 200000
    await app.inject({
      method: 'POST', url: '/assets',
      payload: { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual',
        valuation: { value: 200000, valuedAt: '2025-01-01' } },
    });
    // a loan
    await app.inject({
      method: 'POST', url: '/liabilities',
      payload: { name: 'Home', loanType: 'home', principal: 1000000, annualRate: 9, tenureMonths: 120, startDate: '2024-01-01' },
    });

    const res = await app.inject({ method: 'GET', url: '/networth' });
    expect(res.statusCode).toBe(200);
    const nw = res.json().data;
    expect(nw.totalAssets).toBe(200000);
    expect(nw.totalLiabilities).toBeGreaterThan(0);
    expect(nw.netWorth).toBeCloseTo(nw.totalAssets - nw.totalLiabilities, 2);
    expect(nw.byAssetClass.find((c: any) => c.assetClass === 'gold').value).toBe(200000);
  });

  it('GET /networth on an empty DB returns zeros', async () => {
    app = await buildTestServer();
    const nw = (await app.inject({ method: 'GET', url: '/networth' })).json().data;
    expect(nw.totalAssets).toBe(0);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(0);
  });
});
