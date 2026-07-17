import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runAddTransaction, runUpdateTransaction, runDeleteTransaction, runCategorizeTransaction,
} from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('add_transaction', () => {
  it('inserts a manual transaction and returns its id', async () => {
    ctx = seedContext();
    const r = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'Coffee', amountInr: 250, direction: 'out',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as { id: number }).id;
    expect(id).toBeGreaterThan(0);
    const rows = ctx.repos.expenseTxRepo.query({ limit: 10 });
    expect(rows.find((x) => x.id === id)).toBeTruthy();
  });

  it('rejects a non-positive amount with isError', async () => {
    ctx = seedContext();
    const r = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'X', amountInr: 0, direction: 'out',
    });
    expect(r.isError).toBe(true);
  });
});

describe('update_transaction', () => {
  it('updates amount and note', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'Coffee', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;
    const r = await runUpdateTransaction(ctx, { id, amountInr: 300, note: 'tip included' });
    expect(r.isError).toBeUndefined();
    const row = ctx.repos.expenseTxRepo.query({ limit: 10 }).find((x) => x.id === id);
    expect(row?.amount).toBe(300);
    expect(row?.note).toBe('tip included');
  });

  it('rejects negative amount', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;
    const r = await runUpdateTransaction(ctx, { id, amountInr: -5 });
    expect(r.isError).toBe(true);
  });
});

describe('delete_transaction (preview-gated)', () => {
  it('without confirm returns a preview and does NOT delete', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;
    const r = await runDeleteTransaction(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as { preview: boolean }).preview).toBe(true);
    expect(ctx.repos.expenseTxRepo.query({ limit: 10 }).find((x) => x.id === id)).toBeTruthy();
  });

  it('with confirm deletes the row', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;
    const r = await runDeleteTransaction(ctx, { id, confirm: true });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.expenseTxRepo.query({ limit: 10 }).find((x) => x.id === id)).toBeUndefined();
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runDeleteTransaction(ctx, { id: 9999, confirm: true });
    expect(r.isError).toBe(true);
  });
});

describe('categorize_transaction', () => {
  it('sets category to manual and can learn a merchant rule', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'UPI-SWIGGY-ORDER', amountInr: 400, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;
    const r = await runCategorizeTransaction(ctx, { id, categoryId: 'food', learnRule: 'merchant' });
    expect(r.isError).toBeUndefined();
    const row = ctx.repos.expenseTxRepo.query({ limit: 10 }).find((x) => x.id === id);
    expect(row?.categoryId).toBe('food');
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((rl) => rl.categoryId === 'food')).toBe(true);
  });

  it('unknown transaction id returns isError', async () => {
    ctx = seedContext();
    const r = await runCategorizeTransaction(ctx, { id: 9999, categoryId: 'food' });
    expect(r.isError).toBe(true);
  });
});
