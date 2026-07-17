import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runAddTransaction, runUpdateTransaction } from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('split recipe (compose update + add — documented non-atomic)', () => {
  it('shrinking the original + adding the remainder sums to the original', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-02-01', description: 'Combined bill', amountInr: 1000, direction: 'out',
    });
    const id = (add.structuredContent as { id: number }).id;

    await runUpdateTransaction(ctx, { id, amountInr: 600 });
    const partB = await runAddTransaction(ctx, {
      transactionDate: '2026-02-01', description: 'Combined bill (split)', amountInr: 400, direction: 'out',
    });
    const bId = (partB.structuredContent as { id: number }).id;

    const rows = ctx.repos.expenseTxRepo.query({ limit: 50 });
    const a = rows.find((r) => r.id === id);
    const b = rows.find((r) => r.id === bId);
    expect(a!.amount + b!.amount).toBe(1000);
  });
});
