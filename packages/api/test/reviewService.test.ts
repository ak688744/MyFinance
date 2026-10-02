// packages/api/test/reviewService.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';
import { aggregatePositions, getInvestmentReview, type ReviewDeps } from '../src/lib/reviewService';
import type { Gateway } from '../src/plugins/gateway';
import type { Holding, FundPerformanceRow } from '@myfinance/core';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

const holding = (o: Partial<Holding>): Holding => ({
  id: 1, schemeId: 1, schemeName: 'Fund A Direct Growth', amcName: null, category: 'equity', subCategory: null, folioNumber: null,
  accountName: 'a', investmentApp: 'groww', units: 10, investedValue: 1000, currentValue: 1100, returnsAmount: 100,
  returnsPercent: 10, returnsXirr: null, asOfDate: '2026-09-28', ...o,
});

describe('aggregatePositions', () => {
  it('sums a fund held in two accounts and drops empty positions', () => {
    const out = aggregatePositions([
      holding({ accountName: 'a', units: 10, currentValue: 1100 }),
      holding({ accountName: 'b', units: 5, currentValue: 550 }),
      holding({ schemeId: 2, units: 0, currentValue: 0 }),
    ]);
    expect(out).toEqual([{ schemeId: 1, schemeName: 'Fund A Direct Growth', units: 15, valueInr: 1650 }]);
  });
});

const perf = (amfiCode: string): FundPerformanceRow => ({
  amfiCode, asOf: '2026-08-31', benchmarkCode: '147623', r1y: 0.05, r3y: 0.1, r5y: 0.12, r10y: null, vol3y: 0.2,
  maxDrawdown5y: -0.3, rolling3yBeatPct: 0.3, rolling3yMedianExcess: -0.02, upCapture3y: 0.9, downCapture3y: 1,
  categoryPctile3y: 0.2, categoryPctile5y: 0.3,
});

function seed(app: FastifyInstance) {
  app.repos.performanceUniverseRepo.replaceAll({
    builtAt: '2026-09-01T00:00:00.000Z', asOf: '2026-08-31',
    funds: [
      { amfiCode: '100001', schemeName: 'Fund A Direct Growth', amc: 'AMC', category: 'Equity: Small Cap', latestNav: 110, latestNavDate: '2026-09-28', historyStart: '2015-01-30', rankable: true, builtAt: '2026-09-01T00:00:00.000Z' },
      { amfiCode: '147623', schemeName: 'Motilal Oswal Nifty Smallcap 250 Index Fund', amc: 'MO', category: 'Other: Index Funds', latestNav: 30, latestNavDate: '2026-09-28', historyStart: '2019-09-30', rankable: true, builtAt: '2026-09-01T00:00:00.000Z' },
    ],
    monthlyNav: [],
    performance: [perf('100001'), perf('147623')],
    categoryStats: [{ category: 'Equity: Small Cap', metric: 'r3y', p25: 0.1, median: 0.15, p75: 0.2, n: 30, asOf: '2026-08-31' }],
  });
  app.sqlite.prepare(`INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category) VALUES (1, 'Fund A Direct Growth', '100001', 'AMC', 'equity')`).run();
  app.sqlite.prepare(`INSERT INTO investment_transactions (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
    VALUES (1, 'acct', 'groww', 'Fund A Direct Growth', 'PURCHASE', 10, 100, 1000, '2024-01-01')`).run();
}

const deps: ReviewDeps = {
  nav: { getLatestNAV: async () => 110, getNAVForDate: async () => ({ date: '2026-09-28', nav: 110 }) },
  navHistory: async () => [{ date: '2024-01-01', nav: 10 }, { date: '2026-09-28', nav: 12 }],
  schemeInfo: async () => null,
  today: () => '2026-09-28',
};

function reviewGateway(calls: { n: number }, fail = false): Gateway {
  return {
    async runTask(_task: string, fn: (complete: any) => Promise<any>) {
      calls.n += 1;
      if (fail) throw new Error('boom');
      return fn(async () => ({
        text: JSON.stringify({
          summary: 'One fund to look at.',
          cards: [{ kind: 'dragging', title: 'Fund A trails its benchmark', detail: 'It has lagged across most recent windows.',
            fundIds: [1], impactInr: null, evidence: ['funds[0].rolling3y.beatPct'], discussPrompt: 'Why is Fund A lagging?' }],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
      }));
    },
  } as unknown as Gateway;
}

describe('getInvestmentReview', () => {
  it('is unavailable before the universe is built', async () => {
    app = await buildTestServer();
    const r = await getInvestmentReview(app.repos, reviewGateway({ n: 0 }), deps);
    expect(r).toMatchObject({ reviewUnavailable: true, reason: 'universe_not_built', cards: [] });
  });

  it('runs one review, then serves it from cache', async () => {
    app = await buildTestServer();
    seed(app);
    const calls = { n: 0 };
    const first = await getInvestmentReview(app.repos, reviewGateway(calls), deps);
    expect(first.cached).toBe(false);
    expect(first.cards[0].id).toMatch(/^review:[0-9a-f]{10}:0$/);
    expect(first.asOf).toBe('2026-08-31');
    const second = await getInvestmentReview(app.repos, reviewGateway(calls), deps);
    expect(second.cached).toBe(true);
    expect(second.cards).toEqual(first.cards);
    expect(calls.n).toBe(1);
  });

  it('does not cache a failed review', async () => {
    app = await buildTestServer();
    seed(app);
    const calls = { n: 0 };
    const r = await getInvestmentReview(app.repos, reviewGateway(calls, true), deps);
    expect(r).toMatchObject({ reviewUnavailable: true, reason: 'review_failed' });
    await getInvestmentReview(app.repos, reviewGateway(calls, true), deps);
    expect(calls.n).toBe(2);
  });

  it('reports ai_not_configured without a gateway', async () => {
    app = await buildTestServer();
    seed(app);
    expect((await getInvestmentReview(app.repos, undefined, deps)).reason).toBe('ai_not_configured');
  });

  it('does not cache or show "nothing to review" when every card is dropped by the number guard', async () => {
    app = await buildTestServer();
    seed(app);
    const calls = { n: 0 };
    const gw = {
      async runTask(_t: string, fn: (complete: any) => Promise<any>) {
        calls.n += 1;
        return fn(async () => ({
          text: JSON.stringify({
            summary: 'One fund to look at.',
            cards: [{ kind: 'dragging', title: 'Fund A is up 47.3% this year', detail: 'It gained 47.3% recently.',
              fundIds: [1], impactInr: null, evidence: ['funds[0].rolling3y.beatPct'], discussPrompt: 'Why?' }],
          }),
          usage: { inputTokens: 1, outputTokens: 1 },
        }));
      },
    } as unknown as Gateway;
    const r = await getInvestmentReview(app.repos, gw, deps);
    expect(r).toMatchObject({ reviewUnavailable: true, reason: 'review_failed', cards: [] });
    const cached = app.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_review_cache').get() as { n: number };
    expect(cached.n).toBe(0);
    await getInvestmentReview(app.repos, gw, deps);
    expect(calls.n).toBe(2);
  });

  describe('cache signature', () => {
    it('is invalidated by an AMFI code change', async () => {
      app = await buildTestServer();
      seed(app);
      const calls = { n: 0 };
      await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      app.sqlite.prepare(`UPDATE investment_schemes SET amfi_code = '100002' WHERE id = 1`).run();
      const r = await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      expect(r.cached).toBe(false);
      expect(calls.n).toBe(2);
    });

    it('is invalidated by a new transaction even when rounded units do not move', async () => {
      app = await buildTestServer();
      seed(app);
      const calls = { n: 0 };
      await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      app.sqlite.prepare(`INSERT INTO investment_transactions (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
        VALUES (1, 'acct', 'groww', 'Fund A Direct Growth', 'PURCHASE', 0.001, 100, 0.1, '2024-02-01')`).run();
      const r = await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      expect(r.cached).toBe(false);
      expect(calls.n).toBe(2);
    });

    it('still hits the cache for identical inputs', async () => {
      app = await buildTestServer();
      seed(app);
      const calls = { n: 0 };
      await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      const r = await getInvestmentReview(app.repos, reviewGateway(calls), deps);
      expect(r.cached).toBe(true);
      expect(calls.n).toBe(1);
    });
  });

  describe('partial transaction coverage', () => {
    function promptCapturingGateway(prompts: string[]): Gateway {
      return {
        async runTask(_t: string, fn: (complete: any) => Promise<any>) {
          return fn(async (args: { prompt: string }) => {
            prompts.push(args.prompt);
            return { text: JSON.stringify({ summary: 'ok', cards: [] }), usage: { inputTokens: 1, outputTokens: 1 } };
          });
        },
      } as unknown as Gateway;
    }

    it('marks replay and lots unavailable when one account is snapshot-only', async () => {
      app = await buildTestServer();
      seed(app);
      app.sqlite.prepare(`INSERT INTO investment_import_history (id, account_name, investment_app, import_type, start_date, end_date)
        VALUES (1, 'other', 'groww', 'holdings', '2026-09-28', '2026-09-28')`).run();
      app.sqlite.prepare(`INSERT INTO investment_holdings (import_history_id, scheme_id, account_name, investment_app, scheme_name, units, invested_value, current_value, returns_amount, as_of_date)
        VALUES (1, 1, 'other', 'groww', 'Fund A Direct Growth', 5, 500, 550, 50, '2026-09-28')`).run();
      const prompts: string[] = [];
      await getInvestmentReview(app.repos, promptCapturingGateway(prompts), deps);
      expect(prompts[0]).toContain('transactions cover only part of this holding');
    });

    it('still computes replay and lots when every held account has transactions', async () => {
      app = await buildTestServer();
      seed(app);
      app.sqlite.prepare(`INSERT INTO investment_transactions (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
        VALUES (1, 'acct2', 'groww', 'Fund A Direct Growth', 'PURCHASE', 5, 100, 500, '2024-01-01')`).run();
      const prompts: string[] = [];
      await getInvestmentReview(app.repos, promptCapturingGateway(prompts), deps);
      expect(prompts[0]).not.toContain('transactions cover only part of this holding');
      expect(prompts[0]).toContain('"replay":{"actualXirrPct"');
    });
  });
});
