// packages/mcp/test/performance.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runGetFundPerformance, runCompareToBenchmark, runGetCategoryStats, runScreenCategory } from '../src/tools/read/performance';
import type { McpContext } from '../src/context';
import { monthEndOf, shiftMonths, type FundPerformanceRow } from '@myfinance/core';

let ctx: McpContext;
afterEach(() => ctx?.close());

const perf = (amfiCode: string, o: Partial<FundPerformanceRow> = {}): FundPerformanceRow => ({
  amfiCode, asOf: '2026-08-31', benchmarkCode: '147623', r1y: 0.1, r3y: 0.15, r5y: 0.16, r10y: null, vol3y: 0.2,
  maxDrawdown5y: -0.25, rolling3yBeatPct: 0.5, rolling3yMedianExcess: 0, upCapture3y: 1, downCapture3y: 1,
  categoryPctile3y: 0.5, categoryPctile5y: 0.5, ...o,
});
const growth = (code: string, annual: number) =>
  Array.from({ length: 128 }, (_, k) => ({ amfiCode: code, monthEnd: monthEndOf(shiftMonths('2016-01-31', k)), nav: 100 * (1 + annual) ** (k / 12) }));
const fund = (amfiCode: string, schemeName: string, category: string, historyStart = '2016-01-31') => ({
  amfiCode, schemeName, amc: 'AMC', category, latestNav: 10, latestNavDate: '2026-09-29', historyStart, rankable: true, builtAt: '2026-09-01T00:00:00.000Z',
});

function seedUniverse(c: McpContext) {
  c.repos.performanceUniverseRepo.replaceAll({
    builtAt: '2026-09-01T00:00:00.000Z', asOf: '2026-08-31',
    funds: [
      fund('1', 'Alpha Small Cap Fund Direct Growth', 'Equity: Small Cap'),
      fund('2', 'Beta Small Cap Fund Direct Growth', 'Equity: Small Cap'),
      fund('3', 'Young Small Cap Fund Direct Growth', 'Equity: Small Cap', '2025-01-31'),
      fund('147623', 'Motilal Oswal Nifty Smallcap 250 Index Fund', 'Other: Index Funds'),
    ],
    monthlyNav: [...growth('1', 0.2), ...growth('147623', 0.12)],
    performance: [
      perf('1', { rolling3yMedianExcess: 0.06, downCapture3y: 0.9 }),
      perf('2', { rolling3yMedianExcess: -0.05, downCapture3y: 0.7 }),
      perf('3', { rolling3yMedianExcess: 0.3 }),
      perf('147623'),
    ],
    categoryStats: [{ category: 'Equity: Small Cap', metric: 'r3y', p25: 0.12, median: 0.151, p75: 0.18, n: 2, asOf: '2026-08-31' }],
  });
}

describe('performance read tools', () => {
  it('errors clearly before the universe is built', async () => {
    ctx = seedContext();
    expect((await runGetFundPerformance(ctx, { codes: ['1'] })).isError).toBe(true);
  });

  it('get_fund_performance returns display percentages and lists missing codes', async () => {
    ctx = seedContext();
    seedUniverse(ctx);
    const r = (await runGetFundPerformance(ctx, { codes: ['1', '999'] })).structuredContent as any;
    expect(r.funds[0]).toMatchObject({ amfiCode: '1', schemeName: 'Alpha Small Cap Fund Direct Growth', r3yPct: 15 });
    expect(r.missing).toEqual(['999']);
  });

  it('compare_to_benchmark computes rolling beat vs the category proxy', async () => {
    ctx = seedContext();
    seedUniverse(ctx);
    const r = (await runCompareToBenchmark(ctx, { code: '1' })).structuredContent as any;
    expect(r.benchmarkCode).toBe('147623');
    expect(r.beatPct).toBe(100);
    expect(r.windows).toBe(24);
  });

  it('get_category_stats lists categories on an unknown name', async () => {
    ctx = seedContext();
    seedUniverse(ctx);
    const bad = await runGetCategoryStats(ctx, { category: 'Equity: Unicorn' });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/Equity: Small Cap/);
    const good = (await runGetCategoryStats(ctx, { category: 'Equity: Small Cap' })).structuredContent as any;
    expect(good.stats[0]).toMatchObject({ metric: 'r3y', medianPct: 15.1, n: 2 });
  });

  it('screen_category excludes short-history funds and sorts', async () => {
    ctx = seedContext();
    seedUniverse(ctx);
    const r = (await runScreenCategory(ctx, { category: 'Equity: Small Cap' })).structuredContent as any;
    expect(r.funds.map((f: any) => f.amfiCode)).toEqual(['1', '2']);
    const byDown = (await runScreenCategory(ctx, { category: 'Equity: Small Cap', sortBy: 'downCapture3y' })).structuredContent as any;
    expect(byDown.funds.map((f: any) => f.amfiCode)).toEqual(['2', '1']);
    expect(r.recencyNote).toMatch(/recency/i);
  });
});
