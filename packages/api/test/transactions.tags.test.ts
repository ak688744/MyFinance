import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../src/server';

describe('transaction tags API', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let txId: number;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    const res = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-08-01', description: 'ACME', amount: 100, direction: 'debit' } });
    txId = (res.json() as { data: { id: number } }).data.id;
  });

  it('PATCH replace then add; DELETE removes; 404 on unknown id', async () => {
    let r = await app.inject({ method: 'PATCH', url: `/transactions/${txId}/tags`, payload: { tags: ['Subscription'], mode: 'replace' } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as any).data.tags).toEqual([{ tag: 'subscription', source: 'user' }]);

    r = await app.inject({ method: 'PATCH', url: `/transactions/${txId}/tags`, payload: { tags: ['recurring'], mode: 'add' } });
    expect((r.json() as any).data.tags).toEqual([
      { tag: 'subscription', source: 'user' },
      { tag: 'recurring', source: 'user' },
    ]);

    r = await app.inject({ method: 'DELETE', url: `/transactions/${txId}/tags/subscription` });
    expect((r.json() as any).data.tags).toEqual([{ tag: 'recurring', source: 'user' }]);

    r = await app.inject({ method: 'PATCH', url: `/transactions/999999/tags`, payload: { tags: ['x'], mode: 'add' } });
    expect(r.statusCode).toBe(404);
  });
});
