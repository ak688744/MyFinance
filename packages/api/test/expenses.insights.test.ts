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

// Regression: a real transaction (categoryId set + a cadence tag already applied) kept
// showing as "needs input" forever. Root cause: an earlier triage call for that exact
// event signature failed/was dropped, so a generic "not confidently triaged" FALLBACK
// verdict got persisted to expense_insight_triage — and once cached, nothing ever
// re-checked it against the deterministic cadence backstop. Fix: (1) re-apply the
// backstop when SERVING a cached verdict, so a stale wrong cache row self-heals on the
// very next read with no LLM call; (2) never persist an unconfident (fallback) verdict
// in the first place, so a transient failure just means "retry next load".
describe('GET /expenses/insights — stale-cache self-heal (regression)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  afterEach(async () => { await app.close(); });

  it('a stale cached fallback verdict for an already-cadence-tagged txn is suppressed on read, with no LLM call', async () => {
    app = await buildServer({ dbPath: ':memory:', gateway: triageGateway() });
    const txnId = app.repos.expenseTxRepo.insertManual({
      transactionDate: '2026-08-02', description: 'UPI-XXXXXXX7204-SBIN0031861-123916535575-INVESTMENT', amount: 15000, direction: 'debit', categoryId: 'investment',
    });
    app.repos.expenseTxRepo.addTags(txnId, [{ tag: 'recurring', source: 'agent' }, { tag: 'sip', source: 'agent' }]);

    // Simulate the bug: a stale cache row exists for this event's CURRENT signature,
    // holding the exact fallback shape triageInsights emits on a failed/dropped triage.
    const { events } = await import('../src/lib/insightsService').then((m) => m.buildMonthEvents(app.repos, '2026-08'));
    const target = events.find((e) => e.txnIds.includes(txnId))!;
    app.repos.expenseInsightTriageRepo.upsert({
      signature: target.signature,
      month: '2026-08',
      verdictJson: JSON.stringify({
        eventId: target.eventId, signature: target.signature, tier: 'needs_input', keep: true, lane: 'needs_input',
        refinedTitle: 'New spending', refinedDetail: 'x', question: 'Recurring or one-off?',
        options: [{ label: 'Recurring', tags: ['recurring'], categoryFix: null }],
        reason: 'Not confidently triaged by the model; surfaced for your review.', confident: false,
      }),
    });

    const r = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r.statusCode).toBe(200);
    const data = (r.json() as { data: any[] }).data;
    const card = data.find((c) => c.eventId === target.eventId);
    // Suppressed (backstop-healed) → dropped from the visible list entirely.
    expect(card).toBeUndefined();

    // The healed verdict is written back so the CACHE ROW itself stops being wrong,
    // not just this one read.
    const [row] = app.repos.expenseInsightTriageRepo.getMany([target.signature]);
    const persisted = JSON.parse(row.verdictJson);
    expect(persisted.tier).toBe('suppress');
    expect(persisted.keep).toBe(false);
  });

  it('does NOT persist an unconfident (fallback) verdict, so a transient failure can be retried next load', async () => {
    let calls = 0;
    const failingGateway: Gateway = {
      async runTask<T>(_task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> {
        calls += 1;
        const complete: CompleteFn = async () => ({ text: 'not valid json', usage: { inputTokens: 1, outputTokens: 1 } });
        return fn(complete);
      },
    };
    app = await buildServer({ dbPath: ':memory:', gateway: failingGateway });
    app.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-02', description: 'UPI-UNKNOWNBIZ', amount: 700, direction: 'debit' });

    const r = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r.statusCode).toBe(200);
    // The card still renders (fallback keeps the work-queue visible)...
    expect((r.json() as { data: any[] }).data.length).toBeGreaterThan(0);
    // ...but nothing unconfident was written to the cache.
    const rows = app.sqlite.prepare('SELECT COUNT(*) AS n FROM expense_insight_triage').get() as { n: number };
    expect(rows.n).toBe(0);

    // A second load retries the gateway rather than serving a frozen fallback.
    await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(calls).toBe(2);
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
