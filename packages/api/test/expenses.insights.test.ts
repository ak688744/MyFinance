import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../src/server';

describe('GET /expenses/insights', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    // one uncategorized debit this month → needs_clarity
    app.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-02', description: 'UPI-UNKNOWNBIZ', amount: 700, direction: 'debit' });
  });

  it('400 without month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights' });
    expect(r.statusCode).toBe(400);
  });

  it('returns insights array for the month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r.statusCode).toBe(200);
    const data = (r.json() as { data: { type: string }[] }).data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((i) => i.type === 'needs_clarity')).toBe(true);
  });
});
