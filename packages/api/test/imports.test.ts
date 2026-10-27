import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload, seedInvestments } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('POST /imports/expenses', () => {
  it('imports HDFC expenses and dedupes on re-import', async () => {
    app = await buildTestServer();
    const buf = fixtureBuffer('hdfc-sample.xls');

    const mk = () => multipartPayload('file', 'hdfc-sample.xls', buf, { platform: 'hdfc' });

    const r1 = await app.inject({ method: 'POST', url: '/imports/expenses', ...mk() });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json().data;
    expect(b1.detectedCount).toBe(3);
    expect(b1.insertedCount).toBe(3);

    const r2 = await app.inject({ method: 'POST', url: '/imports/expenses', ...mk() });
    expect(r2.json().data.insertedCount).toBe(0); // dedupe_key conflict
  });

  it('400 when no file part is present', async () => {
    app = await buildTestServer();
    const { payload, headers } = multipartPayload(
      'notafile', 'x.txt', Buffer.from('hi'), { platform: 'hdfc' },
    );
    const r = await app.inject({
      method: 'POST', url: '/imports/expenses',
      payload, headers,
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('removed Groww investment upload endpoints', () => {
  it.each(['/imports/investments/holdings', '/imports/investments/transactions'])(
    'POST %s returns 404',
    async (url) => {
      app = await buildTestServer();
      const hold = multipartPayload(
        'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
        { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
      );
      const r = await app.inject({ method: 'POST', url, ...hold });
      expect(r.statusCode).toBe(404);
    },
  );
});

describe('GET /imports', () => {
  it('lists expense + investment imports', async () => {
    app = await buildTestServer();
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });
    seedInvestments(app, { accountName: 'Groww Main', transactions: false, holdings: true });

    const r = await app.inject({ method: 'GET', url: '/imports' });
    expect(r.statusCode).toBe(200);
    const rows = r.json().data;
    expect(rows.some((x: any) => x.kind === 'expense')).toBe(true);
    expect(rows.some((x: any) => x.kind === 'investment')).toBe(true);
  });
});
