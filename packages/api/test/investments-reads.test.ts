import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

async function seedTwoAccounts(a: FastifyInstance) {
  for (const account of ['Groww Main', 'Groww Family']) {
    await a.inject({
      method: 'POST',
      url: '/imports/investments/holdings',
      ...multipartPayload('file', 'h.xls', fixtureBuffer('groww-holdings-sample.xls'), {
        accountName: account,
        investmentApp: 'groww',
        platform: 'groww',
      }),
    });
    await a.inject({
      method: 'POST',
      url: '/imports/investments/transactions',
      ...multipartPayload('file', 't.xls', fixtureBuffer('groww-transactions-sample.xls'), {
        accountName: account,
        investmentApp: 'groww',
        platform: 'groww',
      }),
    });
  }
}

describe('expanded investment reads', () => {
  it('GET /investments/holdings returns holdings', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/holdings' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.length).toBeGreaterThan(0);
  });

  it('GET /investments/allocation returns allocation array', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/allocation' });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json().data)).toBe(true);
  });

  it('GET /investments/accounts returns both account names (D7)', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/accounts' });
    expect(r.statusCode).toBe(200);
    const accounts = r.json().data as string[];
    expect(accounts).toContain('Groww Main');
    expect(accounts).toContain('Groww Family');
  });

  it('GET /investments/holdings?account=<one> filters to that account', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const all = (
      await app.inject({ method: 'GET', url: '/investments/holdings' })
    ).json().data as any[];
    const one = (
      await app.inject({ method: 'GET', url: '/investments/holdings?account=Groww%20Main' })
    ).json().data as any[];
    expect(one.length).toBeLessThanOrEqual(all.length);
    expect(one.length).toBeGreaterThan(0);
  });
});
