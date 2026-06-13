import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

async function makeAccount(a: FastifyInstance) {
  return (await a.inject({
    method: 'POST', url: '/accounts',
    payload: { domain: 'investment', institution: 'SBI', label: 'PPF' },
  })).json().data.id as number;
}

describe('assets routes', () => {
  it('POST a computed FD with contribution + rate, then GET projects its value', async () => {
    app = await buildTestServer();
    const accountId = await makeAccount(app);
    const post = await app.inject({
      method: 'POST', url: '/assets',
      payload: {
        accountId, assetClass: 'fd', name: 'SBI FD', valuationStrategy: 'computed',
        params: { compounding: 'yearly' },
        contributions: [{ contributionDate: '2024-01-01', amount: 100000 }],
        rates: [{ effectiveFrom: '2020-01-01', rate: 10 }],
      },
    });
    expect(post.statusCode).toBe(201);
    const id = post.json().data.id;

    const list = await app.inject({ method: 'GET', url: '/assets' });
    expect(list.statusCode).toBe(200);
    const fd = list.json().data.find((x: any) => x.assetId === id);
    expect(fd.assetClass).toBe('fd');
    expect(fd.valuationStrategy).toBe('computed');
    expect(fd.currentValue).toBeGreaterThan(100000); // grew with interest
    expect(fd.invested).toBe(100000);
  });

  it('POST a manual gold asset with a valuation, GET shows it', async () => {
    app = await buildTestServer();
    const accountId = await makeAccount(app);
    await app.inject({
      method: 'POST', url: '/assets',
      payload: {
        accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual',
        valuation: { value: 250000, valuedAt: '2025-01-01' },
      },
    });
    const list = await app.inject({ method: 'GET', url: '/assets?assetClass=gold' });
    const gold = list.json().data.find((x: any) => x.assetClass === 'gold');
    expect(gold.currentValue).toBe(250000);
    expect(gold.valuationStrategy).toBe('manual');
  });

  it('POST /assets/:id/contributions adds to a computed asset', async () => {
    app = await buildTestServer();
    const accountId = await makeAccount(app);
    const id = (await app.inject({
      method: 'POST', url: '/assets',
      payload: { accountId, assetClass: 'ppf', name: 'PPF', valuationStrategy: 'computed',
        params: { compounding: 'yearly' }, rates: [{ effectiveFrom: '2020-01-01', rate: 7 }] },
    })).json().data.id;
    const add = await app.inject({
      method: 'POST', url: `/assets/${id}/contributions`,
      payload: { contributionDate: '2024-01-01', amount: 50000 },
    });
    expect(add.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/assets' });
    expect(list.json().data.find((x: any) => x.assetId === id).invested).toBe(50000);
  });

  it('POST /assets with invalid assetClass -> 400', async () => {
    app = await buildTestServer();
    const accountId = await makeAccount(app);
    const res = await app.inject({
      method: 'POST', url: '/assets',
      payload: { accountId, assetClass: 'crypto', name: 'X', valuationStrategy: 'manual' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /assets/:id removes it', async () => {
    app = await buildTestServer();
    const accountId = await makeAccount(app);
    const id = (await app.inject({
      method: 'POST', url: '/assets',
      payload: { accountId, assetClass: 'cash', name: 'Wallet', valuationStrategy: 'manual' },
    })).json().data.id;
    expect((await app.inject({ method: 'DELETE', url: `/assets/${id}` })).statusCode).toBe(200);
  });
});
