import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';

let app: FastifyInstance;
afterEach(async () => { if (app) await app.close(); });

describe('accounts routes', () => {
  it('POST /accounts creates an account (201) and GET lists it', async () => {
    app = await buildTestServer();
    const post = await app.inject({
      method: 'POST', url: '/accounts',
      payload: { domain: 'investment', institution: 'Groww', label: 'Personal' },
    });
    expect(post.statusCode).toBe(201);
    expect(post.json().data.id).toBeGreaterThan(0);

    const get = await app.inject({ method: 'GET', url: '/accounts?domain=investment' });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.map((a: any) => a.label)).toContain('Personal');
  });

  it('POST /accounts with missing fields -> 400', async () => {
    app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/accounts', payload: { domain: 'investment' } });
    expect(res.statusCode).toBe(400);
  });
});
