import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runListAccounts } from '../src/tools/read/accounts';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('list_accounts', () => {
  it('returns [] on a fresh DB', async () => {
    ctx = seedContext();
    const p = (await runListAccounts(ctx, {})).structuredContent as any;
    expect(p.accounts).toEqual([]);
  });

  it('lists accounts and filters by domain', async () => {
    ctx = seedContext();
    ctx.repos.accountRepo.create({ domain: 'investment', institution: 'Groww', label: 'MF' });
    ctx.repos.accountRepo.create({ domain: 'expense', institution: 'HDFC', label: 'Salary' });

    const all = (await runListAccounts(ctx, {})).structuredContent as any;
    expect(all.accounts).toHaveLength(2);

    const inv = (await runListAccounts(ctx, { domain: 'investment' })).structuredContent as any;
    expect(inv.accounts).toHaveLength(1);
    expect(inv.accounts[0].institution).toBe('Groww');
    expect(inv.accounts[0].domain).toBe('investment');
  });
});
