import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

describe('investment import ensures an account', () => {
  it('creates an investment account row for (investmentApp, accountName) on holdings import', async () => {
    app = await buildTestServer();
    const { payload, headers } = multipartPayload(
      'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { platform: 'groww', accountName: 'Personal', investmentApp: 'Groww' },
    );
    const res = await app.inject({ method: 'POST', url: '/imports/investments/holdings', payload, headers });
    expect(res.statusCode).toBe(200);

    const accounts = (await app.inject({ method: 'GET', url: '/accounts?domain=investment' })).json().data;
    expect(accounts.some((a: any) => a.institution === 'Groww' && a.label === 'Personal')).toBe(true);
  });
});
