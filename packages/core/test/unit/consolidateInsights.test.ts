import { describe, it, expect } from 'vitest';
import { consolidateInsights, type ConsolidationTxn } from '../../src/domain/insights/consolidateInsights';
import type { Insight } from '../../src/domain/insights/expenseInsights';

const derive = (d: string) => (d.startsWith('UPI-') ? d.slice(4).split(/[ /]/)[0] : (/^[A-Z ]+$/.test(d) ? null : d));

function txn(id: number, description: string, extra: Partial<ConsolidationTxn> = {}): ConsolidationTxn {
  return { id, description, amount: 100, categoryId: 'shopping', tags: [], ...extra };
}

function insight(partial: Partial<Insight> & { id: string; type: Insight['type']; transactionIds: number[] }): Insight {
  return {
    severity: 'info', title: partial.id, detail: '', cta: { label: 'Review in chat' },
    ...partial,
  } as Insight;
}

describe('consolidateInsights', () => {
  it('merges new_spend candidates that share a merchant into one event', () => {
    const candidates: Insight[] = [
      insight({ id: 'new-spend:merchant:ANANTCARS', type: 'new_spend', transactionIds: [266] }),
      insight({ id: 'new-spend:merchant:ANANTCARS-2', type: 'new_spend', transactionIds: [267] }),
    ];
    const txns = [
      txn(266, 'UPI-ANANTCARS/payment-for-car'),
      txn(267, 'UPI-ANANTCARS/car-invoice'),
    ];
    const events = consolidateInsights(candidates, txns, derive);
    expect(events).toHaveLength(1);
    expect(events[0].txnIds.sort()).toEqual([266, 267]);
    expect(events[0].ruleSignals.map((s) => s.type)).toEqual(['new_spend', 'new_spend']);
  });

  it('does NOT merge new_spend candidates for different merchants', () => {
    const candidates: Insight[] = [
      insight({ id: 'new-spend:merchant:ACMEGYM', type: 'new_spend', transactionIds: [10] }),
      insight({ id: 'new-spend:merchant:NETFLIX', type: 'new_spend', transactionIds: [11] }),
    ];
    const txns = [txn(10, 'UPI-ACMEGYM'), txn(11, 'UPI-NETFLIX')];
    const events = consolidateInsights(candidates, txns, derive);
    expect(events).toHaveLength(2);
  });

  it('keeps needs_clarity and abnormal_spend as their own events — they do NOT connect other events', () => {
    // needs_clarity + abnormal_spend both sweep in txn 266 which a new_spend card also
    // covers. Naive union-find would collapse all three; semantic grouping must NOT.
    const candidates: Insight[] = [
      insight({ id: 'needs-clarity:2026-04', type: 'needs_clarity', transactionIds: [266, 500] }),
      insight({ id: 'new-spend:merchant:ANANTCARS', type: 'new_spend', transactionIds: [266] }),
      insight({ id: 'abnormal-spend:shopping:2026-04', type: 'abnormal_spend', transactionIds: [266, 501], severity: 'warn' }),
    ];
    const txns = [txn(266, 'RTGS DR-ANANTCARS-CAR'), txn(500, 'UPI-SOMETHING'), txn(501, 'UPI-OTHER')];
    const events = consolidateInsights(candidates, txns, derive);
    // 3 distinct events: the clarity card, the merchant card, the abnormal card.
    expect(events).toHaveLength(3);
    const byType = (t: string) => events.filter((e) => e.ruleSignals.some((s) => s.type === t));
    expect(byType('needs_clarity')).toHaveLength(1);
    expect(byType('new_spend')).toHaveLength(1);
    expect(byType('abnormal_spend')).toHaveLength(1);
  });

  it('produces a stable signature from grouped txn ids + their category/tags (order-independent)', () => {
    const c = [insight({ id: 'new-spend:merchant:X', type: 'new_spend', transactionIds: [2, 1] })];
    const txns = [txn(1, 'UPI-X', { categoryId: 'food', tags: [{ tag: 'a' }] }), txn(2, 'UPI-X', { categoryId: 'food', tags: [] })];
    const sigA = consolidateInsights(c, txns, derive)[0].signature;
    // Same data, reversed input order → identical signature.
    const sigB = consolidateInsights(c, [txns[1], txns[0]], derive)[0].signature;
    expect(sigA).toBe(sigB);
    expect(sigA.length).toBeGreaterThan(0);
  });

  it('signature CHANGES when a transaction gains a tag (self-heal trigger)', () => {
    const c = [insight({ id: 'new-spend:merchant:X', type: 'new_spend', transactionIds: [1] })];
    const before = consolidateInsights(c, [txn(1, 'UPI-X', { tags: [] })], derive)[0].signature;
    const after = consolidateInsights(c, [txn(1, 'UPI-X', { tags: [{ tag: 'one_off' }] })], derive)[0].signature;
    expect(before).not.toBe(after);
  });

  it('signature CHANGES when a transaction category is corrected', () => {
    const c = [insight({ id: 'new-spend:merchant:X', type: 'new_spend', transactionIds: [1] })];
    const before = consolidateInsights(c, [txn(1, 'UPI-X', { categoryId: 'rent' })], derive)[0].signature;
    const after = consolidateInsights(c, [txn(1, 'UPI-X', { categoryId: 'loan' })], derive)[0].signature;
    expect(before).not.toBe(after);
  });

  it('empty candidates → []', () => {
    expect(consolidateInsights([], [], derive)).toEqual([]);
  });
});
