import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runCreateAccount } from '../../src/tools/write/accounts';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('create_account', () => {
  it('creates an account and returns its id', async () => {
    ctx = seedContext();
    const r = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as { id: number }).id;
    expect(ctx.repos.accountRepo.getById(id)).toBeTruthy();
  });

  it('is idempotent (find-or-create by domain/institution/label)', async () => {
    ctx = seedContext();
    const a = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    const b = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    expect((a.structuredContent as { id: number }).id).toBe((b.structuredContent as { id: number }).id);
  });
});
