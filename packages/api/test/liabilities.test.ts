import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

const home = {
  name: 'Home', loanType: 'home', principal: 1000000,
  annualRate: 9, tenureMonths: 120, startDate: '2024-01-01',
};

describe('liabilities routes', () => {
  it('POST creates (201), GET lists, GET /:id returns status + schedule', async () => {
    app = await buildTestServer();
    const post = await app.inject({ method: 'POST', url: '/liabilities', payload: home });
    expect(post.statusCode).toBe(201);
    const id = post.json().data.id;

    const list = await app.inject({ method: 'GET', url: '/liabilities' });
    expect(list.json().data.length).toBe(1);

    const one = await app.inject({ method: 'GET', url: `/liabilities/${id}` });
    expect(one.statusCode).toBe(200);
    const body = one.json().data;
    expect(body.liability.name).toBe('Home');
    expect(body.status.outstanding).toBeGreaterThan(0);
    expect(Array.isArray(body.schedule)).toBe(true);
    expect(body.schedule.length).toBe(120);
  });

  it('PATCH updates and DELETE removes', async () => {
    app = await buildTestServer();
    const id = (await app.inject({ method: 'POST', url: '/liabilities', payload: home })).json().data.id;
    const patch = await app.inject({ method: 'PATCH', url: `/liabilities/${id}`, payload: { status: 'closed' } });
    expect(patch.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/liabilities?status=active' })).json().data.length).toBe(0);
    const del = await app.inject({ method: 'DELETE', url: `/liabilities/${id}` });
    expect(del.statusCode).toBe(200);
  });

  it('POST with neither tenure nor emi -> 400', async () => {
    app = await buildTestServer();
    const res = await app.inject({
      method: 'POST', url: '/liabilities',
      payload: { name: 'X', loanType: 'home', principal: 1000, annualRate: 8, startDate: '2024-01-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /:id for a missing loan -> 404', async () => {
    app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/liabilities/999' });
    expect(res.statusCode).toBe(404);
  });
});
