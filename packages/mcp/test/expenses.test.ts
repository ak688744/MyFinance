import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runExpenseSummary, runListTransactions } from '../src/tools/read/expenses';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_expense_summary', () => {
  it('returns zeroed INR-labelled totals on an empty range', async () => {
    ctx = seedContext();
    const r = await runExpenseSummary(ctx, { from: '2025-01-01', to: '2025-12-31' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.totalSpentInr).toBe(0);
    expect(p.totalIncomeInr).toBe(0);
    expect(p.savedInr).toBe(0);
    expect(p.investedInr).toBe(0);
    expect(p.byCategory).toEqual([]);
    expect(p.byMonth).toEqual([]);
  });
});

describe('list_transactions', () => {
  it('returns an empty page on a fresh DB', async () => {
    ctx = seedContext();
    const r = await runListTransactions(ctx, { limit: 10 });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.transactions).toEqual([]);
    expect(p.count).toBe(0);
  });
});
