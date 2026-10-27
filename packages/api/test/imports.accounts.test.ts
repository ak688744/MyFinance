import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

describe('removed Groww investment upload endpoints', () => {
  it.each(['/imports/investments/holdings', '/imports/investments/transactions'])(
    'POST %s is gone (404) and creates no account',
    async (url) => {
      app = await buildTestServer();
      const { payload, headers } = multipartPayload(
        'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
        { platform: 'groww', accountName: 'Personal', investmentApp: 'Groww' },
      );
      const res = await app.inject({ method: 'POST', url, payload, headers });
      expect(res.statusCode).toBe(404);

      const accounts = (await app.inject({ method: 'GET', url: '/accounts?domain=investment' })).json().data;
      expect(accounts.some((a: any) => a.label === 'Personal')).toBe(false);
    },
  );
});
