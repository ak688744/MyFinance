import { describe, it, expect, afterEach } from 'vitest';
import { buildContext, type McpContext } from '../src/context';

let ctx: McpContext | undefined;
afterEach(() => { ctx?.close(); ctx = undefined; });

describe('buildContext', () => {
  it('builds an in-memory context with repos, nav, marketData, and a tx runner', () => {
    ctx = buildContext({ dbPath: ':memory:' });
    expect(ctx.repos.liabilityRepo).toBeDefined();
    expect(ctx.repos.expenseTxRepo).toBeDefined();
    expect(ctx.repos.accountRepo).toBeDefined();
    expect(typeof ctx.nav.getLatestNAV).toBe('function');
    expect(typeof ctx.marketData.searchSchemes).toBe('function');
    // reserved write seam is present but unused
    expect(ctx.runInTransaction(() => 42)).toBe(42);
  });

  it('seeds starter categories so a fresh DB is queryable', () => {
    ctx = buildContext({ dbPath: ':memory:' });
    const cats = ctx.repos.categoryRepo.list();
    expect(cats.length).toBeGreaterThan(0);
  });

  it('accepts an injected marketData that overrides the default', async () => {
    const fake = {
      searchSchemes: async () => [{ schemeCode: '1', schemeName: 'X' } as any],
      getLatestNAV: async () => 10,
      getNAVHistory: async () => [],
    };
    ctx = buildContext({ dbPath: ':memory:', marketData: fake });
    expect(await ctx.marketData.getLatestNAV('1')).toBe(10);
  });
});
