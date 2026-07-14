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

  it('applies account filter to the summary (I1 regression)', async () => {
    // Seed two schemes with NULL amfi_code so NAV lookups aren't called
    ctx = seedContext();
    ctx.sqlite
      .prepare(
        `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category, sub_category)
          VALUES (1,'SchemeA',NULL,'AMC1','equity','Large Cap'),
                 (2,'SchemeB',NULL,'AMC2','debt',NULL)`,
      )
      .run();
    // Seed transactions: accountA invests 2000, accountB invests 1500
    ctx.sqlite
      .prepare(
        `INSERT INTO investment_transactions
          (scheme_id,account_name,investment_app,scheme_name,transaction_type,units,nav,amount,transaction_date)
          VALUES (1,'accountA','groww','SchemeA','PURCHASE',10,100,1000,'2024-01-01'),
                 (1,'accountA','groww','SchemeA','PURCHASE',10,100,1000,'2024-02-01'),
                 (2,'accountB','groww','SchemeB','PURCHASE',15,100,1500,'2024-01-15')`,
      )
      .run();

    // Unfiltered: should sum all accounts
    const rAll = await runInvestmentPortfolio(ctx, {});
    expect(rAll.isError).toBeUndefined();
    const pAll = rAll.structuredContent as any;
    expect(pAll.summary.investedInr).toBe(3500); // 2000 + 1500

    // Filtered by accountA: summary should reflect only accountA's 2000
    const rA = await runInvestmentPortfolio(ctx, { account: 'accountA' });
    expect(rA.isError).toBeUndefined();
    const pA = rA.structuredContent as any;
    expect(pA.summary.investedInr).toBe(2000); // FAILS on buggy code (returns 3500)
    expect(pA.holdings.length).toBe(1); // only SchemeA
    expect(pA.holdings[0].schemeName).toBe('SchemeA');
  });

  it('uses period parameter to scope the portfolio (I2 regression)', async () => {
    // Seed one scheme, transactions across 2+ months
    ctx = seedContext();
    ctx.sqlite
      .prepare(
        `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category, sub_category)
          VALUES (1,'SchemeX',NULL,'AMC','equity',NULL)`,
      )
      .run();
    // Old transaction outside 1M window, recent within 1M
    const today = new Date();
    const oldDate = new Date(today);
    oldDate.setMonth(oldDate.getMonth() - 3); // 3 months ago
    const recentDate = new Date(today);
    recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

    ctx.sqlite
      .prepare(
        `INSERT INTO investment_transactions
          (scheme_id,account_name,investment_app,scheme_name,transaction_type,units,nav,amount,transaction_date)
          VALUES (1,'acct','groww','SchemeX','PURCHASE',10,100,1000,?),
                 (1,'acct','groww','SchemeX','PURCHASE',5,100,500,?)`,
      )
      .run(
        oldDate.toISOString().slice(0, 10),
        recentDate.toISOString().slice(0, 10),
      );

    // ALL period: should include both transactions (1500 total)
    const rAll = await runInvestmentPortfolio(ctx, { period: 'ALL' });
    expect(rAll.isError).toBeUndefined();
    const pAll = rAll.structuredContent as any;
    expect(pAll.summary.investedInr).toBe(1500);

    // 1M period: should only include the recent transaction (500)
    const r1M = await runInvestmentPortfolio(ctx, { period: '1M' });
    expect(r1M.isError).toBeUndefined();
    const p1M = r1M.structuredContent as any;
    expect(p1M.summary.investedInr).toBe(500); // FAILS on buggy code (returns 1500, ignores period)
    expect(p1M.holdings.length).toBe(1);
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
