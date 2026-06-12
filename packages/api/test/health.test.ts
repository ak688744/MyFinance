import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

describe('GET /health', () => {
  it('returns ok with db connectivity', async () => {
    const app = await buildServer({ dbPath: ':memory:' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: 'ok', db: true } });
    await app.close();
  });
});
