import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildContext, type McpContext } from '../src/context';
import { fakeFundData } from './helpers';

let ctx: McpContext | undefined;
afterEach(() => {
  ctx?.close();
  ctx = undefined;
});

describe('buildContext fund-data wiring', () => {
  it('exposes fundData and the two new repos on ctx.repos', async () => {
    const ingest = vi.fn(async () => ({
      schemeId: 42,
      source: 'groww',
      asOfDate: '2026-08-31',
      holdingsCount: 3,
    }));
    ctx = buildContext({
      dbPath: ':memory:',
      fundData: fakeFundData({ ingest }),
    });
    expect(ctx.repos.schemeFundamentalsRepo).toBeDefined();
    expect(ctx.repos.schemeHoldingsRepo).toBeDefined();
    const r = await ctx.fundData.ingest('100001', {});
    expect(r.schemeId).toBe(42);
    expect(ingest).toHaveBeenCalledWith('100001', {});
  });
});
