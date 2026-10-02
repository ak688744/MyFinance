import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';
import { makeSandboxDatasetResolver } from '../src/lib/sandboxDatasets';
import { makeReviewDeps } from '../src/lib/reviewDeps';
import { buildTestServer } from './helpers';

async function setup(navHistoryCalls: string[] = []) {
  const app = await buildServer({ dbPath: ':memory:' });
  const deps = makeReviewDeps({
    navHistory: async (code) => { navHistoryCalls.push(code); return [{ date: '2024-01-02', nav: 11 }]; },
    today: () => '2026-09-30',
  });
  return { app, resolve: makeSandboxDatasetResolver(app.repos, deps) };
}

describe('makeSandboxDatasetResolver', () => {
  it('nav: returns daily history for a benchmark proxy (tier C)', async () => {
    const calls: string[] = [];
    const { app, resolve } = await setup(calls);
    expect(await resolve('nav:120716')).toEqual({ code: '120716', frequency: 'daily', points: [{ date: '2024-01-02', nav: 11 }] });
    expect(calls).toEqual(['120716']);
    await app.close();
  });

  it('nav: returns month-end history for a universe fund, without the network', async () => {
    const calls: string[] = [];
    const { app, resolve } = await setup(calls);
    const builtAt = '2026-09-01T00:00:00Z';
    app.repos.performanceUniverseRepo.replaceAll({
      builtAt, asOf: '2026-08-31',
      funds: [{ amfiCode: '555555', schemeName: 'Test Fund', amc: 'T', category: 'Equity: Small Cap', latestNav: 10, latestNavDate: '2026-08-31', historyStart: '2020-01-31', rankable: true, builtAt }],
      monthlyNav: [{ amfiCode: '555555', monthEnd: '2026-07-31', nav: 9 }, { amfiCode: '555555', monthEnd: '2026-08-31', nav: 10 }],
      performance: [], categoryStats: [],
    });
    const r = await resolve('nav:555555') as { frequency: string; points: unknown[] };
    expect(r.frequency).toBe('monthly');
    expect(r.points).toHaveLength(2);
    expect(calls).toEqual([]);
    await app.close();
  });

  it('transactions: unknown scheme is an error', async () => {
    const { app, resolve } = await setup();
    await expect(resolve('transactions:99999')).rejects.toThrow(/No scheme with id 99999/);
    await app.close();
  });

  it('universe_stats and fact_sheet explain an unbuilt universe', async () => {
    const { app, resolve } = await setup();
    await expect(resolve('universe_stats')).rejects.toThrow(/universe has not been built/);
    await expect(resolve('fact_sheet')).rejects.toThrow(/universe_not_built/);
    await app.close();
  });

  it('category_stats returns an array (empty when unbuilt)', async () => {
    const { app, resolve } = await setup();
    expect(await resolve('category_stats')).toEqual([]);
    await app.close();
  });

  it('rejects unknown names', async () => {
    const { app, resolve } = await setup();
    await expect(resolve('secrets')).rejects.toThrow(/Unknown dataset/);
    await app.close();
  });

  it.each(['nav:', 'nav:123:evil', 'nav:1e2', 'transactions:abc', 'transactions:1:2', ' nav:123'])('rejects malformed name %j', async (name) => {
    const { app, resolve } = await setup();
    await expect(resolve(name)).rejects.toThrow(/^Unknown dataset/);
    await app.close();
  });
});

describe('makeSandboxDatasetResolver with an owned scheme', () => {
  async function seeded() {
    const app = await buildTestServer();
    const builtAt = '2026-09-01T00:00:00.000Z';
    const perf = (amfiCode: string) => ({
      amfiCode, asOf: '2026-08-31', benchmarkCode: '147623', r1y: 0.05, r3y: 0.1, r5y: 0.12, r10y: null, vol3y: 0.2,
      maxDrawdown5y: -0.3, rolling3yBeatPct: 0.3, rolling3yMedianExcess: -0.02, upCapture3y: 0.9, downCapture3y: 1,
      categoryPctile3y: 0.2, categoryPctile5y: 0.3,
    });
    app.repos.performanceUniverseRepo.replaceAll({
      builtAt, asOf: '2026-08-31',
      funds: [
        { amfiCode: '100001', schemeName: 'Fund A Direct Growth', amc: 'AMC', category: 'Equity: Small Cap', latestNav: 110, latestNavDate: '2026-09-28', historyStart: '2015-01-30', rankable: true, builtAt },
        { amfiCode: '147623', schemeName: 'Motilal Oswal Nifty Smallcap 250 Index Fund', amc: 'MO', category: 'Other: Index Funds', latestNav: 30, latestNavDate: '2026-09-28', historyStart: '2019-09-30', rankable: true, builtAt },
      ],
      monthlyNav: [],
      performance: [perf('100001'), perf('147623')],
      categoryStats: [{ category: 'Equity: Small Cap', metric: 'r3y', p25: 0.1, median: 0.15, p75: 0.2, n: 30, asOf: '2026-08-31' }],
    });
    app.sqlite.prepare(`INSERT INTO investment_schemes (id, scheme_name, amfi_code, amc_name, category) VALUES (1, 'Fund A Direct Growth', '100001', 'AMC', 'equity')`).run();
    const ins = app.sqlite.prepare(`INSERT INTO investment_transactions (scheme_id, account_name, investment_app, scheme_name, transaction_type, units, nav, amount, transaction_date)
      VALUES (1, 'acct', 'groww', 'Fund A Direct Growth', 'PURCHASE', ?, ?, ?, ?)`);
    ins.run(5, 120, 600, '2025-01-01'); // inserted out of date order on purpose
    ins.run(10, 100, 1000, '2024-01-01');
    const deps = makeReviewDeps({
      nav: { getLatestNAV: async () => 110, getNAVForDate: async () => ({ date: '2026-09-28', nav: 110 }) },
      navHistory: async () => [{ date: '2024-01-01', nav: 10 }, { date: '2026-09-28', nav: 12 }],
      schemeInfo: async () => null,
      today: () => '2026-09-28',
    });
    return { app, resolve: makeSandboxDatasetResolver(app.repos, deps) };
  }

  it('transactions: returns rows sorted by date', async () => {
    const { app, resolve } = await seeded();
    expect(await resolve('transactions:1')).toEqual({
      schemeId: 1, schemeName: 'Fund A Direct Growth', amfiCode: '100001',
      transactions: [
        { date: '2024-01-01', type: 'PURCHASE', units: 10, nav: 100, amountInr: 1000 },
        { date: '2025-01-01', type: 'PURCHASE', units: 5, nav: 120, amountInr: 600 },
      ],
    });
    await app.close();
  });

  it('fact_sheet: succeeds for a built universe with holdings', async () => {
    const { app, resolve } = await seeded();
    const sheet = await resolve('fact_sheet') as { positions?: unknown[]; funds?: unknown[] };
    expect(sheet).toBeTruthy();
    expect(sheet).not.toHaveProperty('unavailable');
    await app.close();
  });
});
