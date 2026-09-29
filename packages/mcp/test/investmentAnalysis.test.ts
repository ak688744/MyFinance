import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import {
  runAnalyzeFundOverlap,
  runGetPortfolioHoldingsStatus,
  runGetPortfolioLookthrough,
} from '../src/tools/read/investmentAnalysis';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function seedSchemeWithHoldings(
  ctx: McpContext,
  opts: {
    id: number;
    name: string;
    invested: number;
    holdings: { name: string; weight: number }[];
  },
) {
  ctx.sqlite
    .prepare(
      `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category, sub_category)
       VALUES (?, ?, '10000' || ?, 'AMC', 'equity', NULL)`,
    )
    .run(opts.id, opts.name, opts.id);
  ctx.sqlite
    .prepare(
      `INSERT INTO investment_transactions
        (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
       VALUES (?, 'acct', 'groww', ?, 'PURCHASE', 10, 100, ?, '2024-01-01')`,
    )
    .run(opts.id, opts.name, opts.invested);
  ctx.repos.schemeFundamentalsRepo.upsert({
    schemeId: opts.id,
    expenseRatioDirect: 0.4,
    expenseRatioRegular: 1.4,
    planType: 'regular',
    aum: 10000,
    benchmarkName: 'Nifty 50',
    stdDev: null,
    sharpe: null,
    beta: null,
    alpha: null,
    source: 'groww',
  });
  ctx.repos.schemeHoldingsRepo.replaceSnapshot(
    opts.id,
    '2026-08-31',
    opts.holdings.map((h) => ({
      securityName: h.name,
      isin: null,
      weightPct: h.weight,
      sector: 'Financials',
      marketCapBucket: 'large' as const,
    })),
  );
}

describe('investment analysis read tools', () => {
  it('reports hasHoldings:false when no snapshot exists', async () => {
    ctx = seedContext();
    ctx.sqlite
      .prepare(
        `INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category)
         VALUES (1, 'Empty Fund', '100001', 'AMC', 'equity')`,
      )
      .run();
    ctx.sqlite
      .prepare(
        `INSERT INTO investment_transactions
          (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
         VALUES (1, 'acct', 'groww', 'Empty Fund', 'PURCHASE', 1, 100, 1000, '2024-01-01')`,
      )
      .run();

    const r = await runGetPortfolioHoldingsStatus(ctx, {});
    expect(r.isError).toBeUndefined();
    const coverage = (r.structuredContent as any).coverage;
    expect(coverage).toHaveLength(1);
    expect(coverage[0].hasHoldings).toBe(false);
    // exposes the stored AMFI code + refreshable flag so the agent never guesses codes
    expect(coverage[0].amfiCode).toBe('100001');
    expect(coverage[0].refreshable).toBe(true);
  });

  it('returns overlap pairs for two funds with shared holdings', async () => {
    ctx = seedContext();
    seedSchemeWithHoldings(ctx, {
      id: 1,
      name: 'Fund A',
      invested: 10000,
      holdings: [
        { name: 'HDFC Bank', weight: 40 },
        { name: 'Reliance', weight: 20 },
      ],
    });
    seedSchemeWithHoldings(ctx, {
      id: 2,
      name: 'Fund B',
      invested: 10000,
      holdings: [
        { name: 'HDFC Bank', weight: 35 },
        { name: 'Infosys', weight: 25 },
      ],
    });

    const r = await runAnalyzeFundOverlap(ctx, {});
    expect(r.isError).toBeUndefined();
    const pairs = (r.structuredContent as any).pairs;
    expect(pairs).toHaveLength(1);
    expect(pairs[0].overlapPct).toBeGreaterThan(0);
  });

  it('returns look-through sector roll-up', async () => {
    ctx = seedContext();
    seedSchemeWithHoldings(ctx, {
      id: 1,
      name: 'Fund A',
      invested: 10000,
      holdings: [{ name: 'HDFC Bank', weight: 50 }],
    });

    const r = await runGetPortfolioLookthrough(ctx, {});
    expect(r.isError).toBeUndefined();
    const lt = r.structuredContent as any;
    expect(lt.totalValueInr).toBeGreaterThan(0);
    expect(lt.bySector.length).toBeGreaterThan(0);
  });
});
