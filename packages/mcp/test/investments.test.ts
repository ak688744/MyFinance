import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runInvestmentPortfolio, runInvestmentReturns } from '../src/tools/read/investments';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_investment_portfolio', () => {
  it('returns an empty-but-valid portfolio on a fresh DB', async () => {
    ctx = seedContext();
    const r = await runInvestmentPortfolio(ctx, {});
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.summary.investedInr).toBe(0);
    expect(p.summary.currentValueInr).toBe(0);
    expect(p.holdings).toEqual([]);
    expect(p.allocation).toEqual([]);
    // xirrFraction present (null when no cashflows) — name signals it is a fraction
    expect('xirrFraction' in p.summary).toBe(true);
  });
});

describe('get_investment_returns', () => {
  it('returns an ALL-period result with a fraction-named xirr field', async () => {
    ctx = seedContext();
    const r = await runInvestmentReturns(ctx, { period: 'ALL' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.period).toBe('ALL');
    expect('xirrFraction' in p).toBe(true);
    expect('endValueInr' in p).toBe(true);
  });
});
