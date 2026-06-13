import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

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

describe('POST /imports/investments/*', () => {
  it('holdings import then transactions import then reads are populated', async () => {
    app = await buildTestServer();

    const hold = multipartPayload(
      'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(200);
    expect(rh.json().data.importedCount).toBe(2);

    const tx = multipartPayload(
      'file', 'groww-transactions-sample.xls', fixtureBuffer('groww-transactions-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rt = await app.inject({ method: 'POST', url: '/imports/investments/transactions', ...tx });
    expect(rt.statusCode).toBe(200);
    expect(rt.json().data.status).toBe('success');
    expect(rt.json().data.importedCount).toBe(3);

    const rs = await app.inject({ method: 'GET', url: '/investments/summary' });
    expect(rs.statusCode).toBe(200);
    expect(rs.json().data.totalInvested).toBeGreaterThan(0);
  });

  it('transactions without prior holdings -> 200 unmatched_schemes, DB untouched', async () => {
    app = await buildTestServer();
    const tx = multipartPayload(
      'file', 'groww-transactions-sample.xls', fixtureBuffer('groww-transactions-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rt = await app.inject({ method: 'POST', url: '/imports/investments/transactions', ...tx });
    expect(rt.statusCode).toBe(200);
    const data = rt.json().data;
    expect(data.status).toBe('unmatched_schemes');
    expect(data.unmatchedSchemes.length).toBeGreaterThan(0);
  });

  it('400 when accountName field is missing on holdings', async () => {
    app = await buildTestServer();
    const hold = multipartPayload(
      'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { investmentApp: 'groww', platform: 'groww' }, // no accountName
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(400);
  });

  it('400 for unsupported platform', async () => {
    app = await buildTestServer();
    const hold = multipartPayload(
      'file', 'x.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { accountName: 'A', investmentApp: 'etmoney', platform: 'etmoney' },
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(400);
  });
});

describe('GET /imports', () => {
  it('lists expense + investment imports', async () => {
    app = await buildTestServer();
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });
    await app.inject({
      method: 'POST', url: '/imports/investments/holdings',
      ...multipartPayload('file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
        { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' }),
    });

    const r = await app.inject({ method: 'GET', url: '/imports' });
    expect(r.statusCode).toBe(200);
    const rows = r.json().data;
    expect(rows.some((x: any) => x.kind === 'expense')).toBe(true);
    expect(rows.some((x: any) => x.kind === 'investment')).toBe(true);
  });
});
