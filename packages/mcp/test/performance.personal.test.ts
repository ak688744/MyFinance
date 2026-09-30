import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runReplayCashflows, runGetLotsAndTax, runEstimateSwitchCost } from '../src/tools/read/performance';
import { runFetchFundDetails } from '../src/tools/write/fundDetails';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function seedOwned(c: McpContext, name = 'Axis ELSS Tax Saver Direct Growth') {
  c.sqlite.prepare(`INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category) VALUES (5, ?, '120503', 'Axis', 'equity')`).run(name);
  const ins = c.sqlite.prepare(`INSERT INTO investment_transactions (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
    VALUES (5, 'acct', 'groww', ?, ?, ?, ?, ?, ?)`);
  ins.run(name, 'PURCHASE', 100, 10, 1000, '2020-01-01');
  ins.run(name, 'PURCHASE', 50, 20, 1000, new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
}

describe('personal performance tools', () => {
  it('replay_cashflows compares actual value with the same flows in a target', async () => {
    ctx = seedContext({
      marketData: {
        getLatestNAV: async () => 30,
        getNAVHistory: async () => [
          { date: '2020-01-01', nav: 10 },
          { date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), nav: 19 },
          { date: new Date().toISOString().slice(0, 10), nav: 20 },
        ],
      },
    });
    seedOwned(ctx);
    const r = await runReplayCashflows(ctx, { schemeId: 5, targetCode: '147625' });
    expect(r.isError).toBeUndefined();
    const d = r.structuredContent as any;
    expect(d.actualValueInr).toBe(4500); // 150 units × 30
    expect(typeof d.diffInr).toBe('number');
  });

  it('replay_cashflows errors for a fund without transactions', async () => {
    ctx = seedContext();
    ctx.sqlite.prepare(`INSERT INTO investment_schemes (id, scheme_name, amfi_code) VALUES (1, 'X', '1')`).run();
    expect((await runReplayCashflows(ctx, { schemeId: 1, targetCode: '147625' })).isError).toBe(true);
  });

  it('get_lots_and_tax reports ELSS-locked value and gains', async () => {
    ctx = seedContext({ marketData: { getLatestNAV: async () => 30 } });
    seedOwned(ctx);
    const d = (await runGetLotsAndTax(ctx, { schemeId: 5 })).structuredContent as any;
    expect(d.taxRegime).toBe('equity');
    expect(d.elssLockedValueInr).toBe(1500); // the recent 50-unit lot
    expect(d.longTermGainInr).toBe(2000);    // 100 × (30 − 10)
    expect(d.taxRulesEffectiveFrom).toBe('2024-07-23');
  });

  it('estimate_switch_cost skips locked ELSS units', async () => {
    ctx = seedContext({ marketData: { getLatestNAV: async () => 30 } });
    seedOwned(ctx);
    const d = (await runEstimateSwitchCost(ctx, { schemeId: 5 })).structuredContent as any;
    expect(d.lockedUnitsSkipped).toBe(50);
    expect(d.unitsSold).toBe(100);
    expect(d.ltcgTaxInr).toBe(0); // gain 2000 is below the exemption
  });

  it('fetch_fund_details caches for 30 days', async () => {
    let calls = 0;
    ctx = seedContext({ fundDetails: { fetch: async (code, name) => { calls += 1; return (await import('./helpers')).fakeFundDetails().fetch(code, name); } } });
    seedOwned(ctx);
    const first = (await runFetchFundDetails(ctx, { code: '120503' })).structuredContent as any;
    expect(first.cached).toBe(false);
    expect(first.topHoldings[0].name).toBe('HDFC Bank');
    const second = (await runFetchFundDetails(ctx, { code: '120503' })).structuredContent as any;
    expect(second.cached).toBe(true);
    expect(calls).toBe(1);
    expect((await runFetchFundDetails(ctx, { code: '000000' })).isError).toBe(true);
  });
});
