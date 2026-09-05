import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runTagTransaction } from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('tag_transaction tool', () => {
  it('adds agent tags; replace overwrites; unknown id errors', async () => {
    ctx = seedContext();
    const id = ctx.repos.expenseTxRepo.insertManual({
      transactionDate: '2026-08-01',
      description: 'NETFLIX',
      amount: 500,
      direction: 'debit',
    });

    let res = await runTagTransaction(ctx, { id, tags: ['Subscription'], mode: 'add' });
    expect(res.isError).toBeFalsy();
    expect(ctx.repos.expenseTxRepo.getTags(id)).toEqual([{ tag: 'subscription', source: 'agent' }]);

    res = await runTagTransaction(ctx, { id, tags: ['recurring'], mode: 'replace' });
    expect(ctx.repos.expenseTxRepo.getTags(id)).toEqual([{ tag: 'recurring', source: 'agent' }]);

    res = await runTagTransaction(ctx, { id: 999999, tags: ['x'], mode: 'add' });
    expect(res.isError).toBe(true);
  });
});
