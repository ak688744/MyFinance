import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import type { CompleteFn } from '@myfinance/agents';
import type { Gateway } from '../src/plugins/gateway';

// A fake gateway whose triage response keeps the event as a needs_input card with
// a concrete option that applies ['one_off'].
function triageGateway(): Gateway {
  return {
    async runTask<T>(_task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> {
      const complete: CompleteFn = async (input) => {
        // Echo one verdict per event id present in the prompt.
        const ids = [...input.prompt.matchAll(/"eventId": "([^"]+)"/g)].map((m) => m[1]);
        const verdicts = ids.map((eventId) => ({
          eventId, tier: 'needs_input', keep: true, lane: 'needs_input',
          refinedTitle: 'Clarify this spend', refinedDetail: 'x',
          question: 'Recurring or one-off?',
          options: [
            { label: 'One-off', tags: ['one_off'], categoryFix: null },
            { label: 'Recurring', tags: ['recurring'], categoryFix: null },
          ],
          reason: 'cadence unknown',
        }));
        return { text: JSON.stringify({ verdicts }), usage: { inputTokens: 5, outputTokens: 5 } };
      };
      return fn(complete);
    },
  };
}

describe('GET /expenses/insights (triaged)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:', gateway: triageGateway() });
    app.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-02', description: 'UPI-UNKNOWNBIZ', amount: 700, direction: 'debit' });
  });
  afterEach(async () => { await app.close(); });

  it('400 without month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights' });
    expect(r.statusCode).toBe(400);
  });

  it('returns triaged cards with tier + options for the month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r.statusCode).toBe(200);
    const data = (r.json() as { data: any[] }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].tier).toBe('needs_input');
    expect(data[0].options[0]).toHaveProperty('tags');
    expect(data[0].txnIds).toContain(app.repos.expenseTxRepo.query({ from: '2026-08-01', to: '2026-08-31' })[0].id);
  });

  it('caches per-event: a second call serves the stored verdict (no re-triage needed)', async () => {
    await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    // find the event signature that got persisted
    const rows = app.sqlite.prepare('SELECT COUNT(*) AS n FROM expense_insight_triage').get() as { n: number };
    expect(rows.n).toBeGreaterThan(0);
    const r2 = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r2.statusCode).toBe(200);
    expect((r2.json() as { data: any[] }).data.length).toBeGreaterThan(0);
  });
});

describe('POST /expenses/insights/resolve → self-heal', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let txnId: number;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:', gateway: triageGateway() });
    app.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-02', description: 'UPI-UNKNOWNBIZ', amount: 700, direction: 'debit' });
    txnId = app.repos.expenseTxRepo.query({ from: '2026-08-01', to: '2026-08-31' })[0].id;
  });
  afterEach(async () => { await app.close(); });

  it('400 with empty transactionIds', async () => {
    const r = await app.inject({ method: 'POST', url: '/expenses/insights/resolve', payload: { transactionIds: [], tags: ['one_off'] } });
    expect(r.statusCode).toBe(400);
  });

  it('applies tags (source=agent) and disappears the card on next load', async () => {
    // card is present initially
    const before = (await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' })).json() as { data: any[] };
    expect(before.data.length).toBeGreaterThan(0);

    // resolve: tag the txn one_off
    const res = await app.inject({ method: 'POST', url: '/expenses/insights/resolve', payload: { transactionIds: [txnId], tags: ['one_off'] } });
    expect(res.statusCode).toBe(200);
    const tags = app.repos.expenseTxRepo.getTags(txnId);
    expect(tags.map((t) => t.tag)).toContain('one_off');
    expect(tags[0].source).toBe('agent');

    // needs_clarity requires untagged → the event's signature changed → re-triage.
    // With the txn now tagged, needs_clarity no longer fires, so that card is gone.
    const after = (await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' })).json() as { data: any[] };
    const clarity = after.data.filter((c) => c.eventId.includes('needs-clarity'));
    expect(clarity).toHaveLength(0);
  });

  it('applies a category fix (source=manual)', async () => {
    const r = await app.inject({ method: 'POST', url: '/expenses/insights/resolve', payload: { transactionIds: [txnId], categoryFix: 'shopping' } });
    expect(r.statusCode).toBe(200);
    const row = app.repos.expenseTxRepo.query({ from: '2026-08-01', to: '2026-08-31' }).find((t) => t.id === txnId)!;
    expect(row.categoryId).toBe('shopping');
  });

  it('400 on unknown categoryFix', async () => {
    const r = await app.inject({ method: 'POST', url: '/expenses/insights/resolve', payload: { transactionIds: [txnId], categoryFix: 'not_a_category' } });
    expect(r.statusCode).toBe(400);
  });
});
