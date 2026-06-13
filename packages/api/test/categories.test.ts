import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('GET /categories', () => {
  it('returns seeded starter categories', async () => {
    app = await buildTestServer();
    const r = await app.inject({ method: 'GET', url: '/categories' });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json().data)).toBe(true);
    expect(r.json().data.length).toBeGreaterThan(0); // seeded
  });
});

describe('category rule CRUD', () => {
  it('creating a merchant rule recategorizes matching expense transactions', async () => {
    app = await buildTestServer();
    // import expenses first so there are non-manual transactions to recategorize
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });

    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0].id;

    const create = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'swiggy', categoryId },
    });
    expect(create.statusCode).toBe(201);

    // the SWIGGY transaction should now carry categoryId
    const tx = (await app.inject({ method: 'GET', url: '/transactions?limit=50' })).json().data as any[];
    const swiggy = tx.find((t) => String(t.description).toLowerCase().includes('swiggy'));
    expect(swiggy?.category_id ?? swiggy?.categoryId).toBe(categoryId);
  });

  it('empty pattern -> 400', async () => {
    app = await buildTestServer();
    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0].id;
    const r = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: '   ', categoryId },
    });
    expect(r.statusCode).toBe(400);
  });

  it('DELETE /categories/rules/:id returns 200', async () => {
    app = await buildTestServer();
    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0].id;
    const create = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'amazon', categoryId },
    });
    expect(create.statusCode).toBe(201);
    const del = await app.inject({ method: 'DELETE', url: '/categories/rules/1' });
    expect(del.statusCode).toBe(200);
  });

  it('PATCH /categories/rules/:id moves matching transactions to the new category', async () => {
    app = await buildTestServer();
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });
    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const [first, second] = cats;

    const create = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'swiggy', categoryId: first.id },
    });
    expect(create.statusCode).toBe(201);

    const patch = await app.inject({
      method: 'PATCH', url: '/categories/rules/1',
      payload: { ruleType: 'merchant', categoryId: second.id },
    });
    expect(patch.statusCode).toBe(200);

    // recategorization (re-run internally by updateRuleCategory) now assigns the new id
    const tx = (await app.inject({ method: 'GET', url: '/transactions?limit=50' })).json().data as any[];
    const swiggy = tx.find((t) => String(t.description).toLowerCase().includes('swiggy'));
    expect(swiggy?.category_id ?? swiggy?.categoryId).toBe(second.id);
  });

  it('POST /recategorize returns 200', async () => {
    app = await buildTestServer();
    const r = await app.inject({ method: 'POST', url: '/recategorize' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ ok: true });
  });
});

describe('import error paths', () => {
  it('400 on corrupt / non-xls file bytes (parser throws)', async () => {
    app = await buildTestServer();
    const { payload, headers } = multipartPayload(
      'file', 'garbage.xls', Buffer.from('this is definitely not a valid xls file'),
      { platform: 'hdfc' },
    );
    const r = await app.inject({ method: 'POST', url: '/imports/expenses', payload, headers });
    expect(r.statusCode).toBe(400);
  });
});
