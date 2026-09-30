import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makePerformanceUniverseRepo } from '../../src/repositories/performanceUniverseRepo';
import { refreshUniverse, mapWithConcurrency } from '../../src/domain/performance/universe';
import { BENCHMARK_PROXIES } from '../../src/domain/performance/benchmarks';
import type { NavPoint } from '../../src/types';

const LIST = [
  'Open Ended Schemes(Equity Scheme - Small Cap Fund)',
  'AMC One',
  '1001;X;-;Alpha Small Cap Fund;Direct Plan;Growth Option;50;29-Sep-2026',
  '1002;X;-;Beta Small Cap Fund;Direct Plan;Growth Option;40;29-Sep-2026',
  '1003;X;-;Young Small Cap Fund;Direct Plan;Growth Option;12;29-Sep-2026',
  'Open Ended Schemes(Other Scheme - Index Funds)',
  'AMC Two',
  `${BENCHMARK_PROXIES.smallcap250.amfiCode};X;-;Motilal Oswal Nifty Smallcap 250 Index Fund;Direct Plan;Growth Option;30;29-Sep-2026`,
].join('\n');

function daily(annual: number, fromYear: number): NavPoint[] {
  const out: NavPoint[] = [];
  for (let d = Date.UTC(fromYear, 0, 1); d <= Date.UTC(2026, 8, 29); d += 7 * 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    out.push({ date, nav: 10 * Math.pow(1 + annual, (d - Date.UTC(fromYear, 0, 1)) / (365 * 86_400_000)) });
  }
  return out;
}

const HISTORIES: Record<string, NavPoint[]> = {
  '1001': daily(0.2, 2016),
  '1002': daily(0.08, 2016),
  '1003': daily(0.1, 2025),
  [BENCHMARK_PROXIES.smallcap250.amfiCode]: daily(0.12, 2016),
};

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  const repo = makePerformanceUniverseRepo(db);
  const runInTransaction = <T>(fn: () => T): T => sqlite.transaction(fn)();
  return { repo, sqlite, runInTransaction };
}

describe('refreshUniverse', () => {
  it('builds funds, performance and category stats as of the last completed month', async () => {
    const { repo, sqlite, runInTransaction } = setup();
    const r = await refreshUniverse({
      fetchNavList: async () => LIST,
      fetchHistory: async (c) => HISTORIES[c],
      repo, runInTransaction, now: () => new Date('2026-09-30T00:00:00Z'),
    });
    expect(r.asOf).toBe('2026-08-31');
    expect(r.funds).toBe(4);
    expect(r.ranked).toBe(3); // the young fund is not rankable
    expect(repo.getFund('1003')?.rankable).toBe(false);
    const alpha = repo.getPerformance(['1001'])[0];
    expect(alpha.benchmarkCode).toBe(BENCHMARK_PROXIES.smallcap250.amfiCode);
    expect(alpha.rolling3yBeatPct).toBe(1);
    expect(repo.getPerformance(['1002'])[0].rolling3yBeatPct).toBe(0);
    expect(repo.getCategoryStats('Equity: Small Cap').find((s) => s.metric === 'r3y')?.n).toBe(2);
    expect(repo.getMonthlyNav('1001').length).toBeGreaterThan(100);
    sqlite.close();
  });

  it('aborts and keeps the old universe when the list is an HTML error page', async () => {
    const { repo, sqlite, runInTransaction } = setup();
    await refreshUniverse({ fetchNavList: async () => LIST, fetchHistory: async (c) => HISTORIES[c], repo, runInTransaction });
    const before = repo.getMeta();
    const fundsBefore = repo.listFunds().length;
    const navBefore = repo.getMonthlyNav('1001').length;
    await expect(refreshUniverse({
      fetchNavList: async () => '<html>503</html>', fetchHistory: async () => [], repo, runInTransaction,
    })).rejects.toThrow(/no Direct-Growth funds/);
    expect(repo.getMeta()).toEqual(before);
    expect(repo.listFunds().length).toBe(fundsBefore);
    expect(repo.getMonthlyNav('1001').length).toBe(navBefore);
    expect(fundsBefore).toBeGreaterThan(0);
    sqlite.close();
  });

  it('aborts when too many histories fail', async () => {
    const { repo, sqlite, runInTransaction } = setup();
    await expect(refreshUniverse({
      fetchNavList: async () => LIST,
      fetchHistory: async (c) => { if (c !== '1001') throw new Error('boom'); return HISTORIES[c]; },
      repo, runInTransaction,
    })).rejects.toThrow(/aborted/);
    expect(repo.getMeta()).toBeNull();
    sqlite.close();
  });
});

describe('refreshUniverse outage handling', () => {
  it('treats empty histories as failures and keeps the previous universe untouched', async () => {
    const { repo, sqlite, runInTransaction } = setup();
    await refreshUniverse({ fetchNavList: async () => LIST, fetchHistory: async (c) => HISTORIES[c], repo, runInTransaction });
    const before = repo.getMeta();
    const fundsBefore = repo.listFunds().length;
    const navBefore = repo.getMonthlyNav('1001').length;
    await expect(refreshUniverse({
      fetchNavList: async () => LIST, fetchHistory: async () => [], repo, runInTransaction,
    })).rejects.toThrow(/aborted/);
    expect(repo.getMeta()).toEqual(before);
    expect(repo.listFunds().length).toBe(fundsBefore);
    expect(repo.getMonthlyNav('1001').length).toBe(navBefore);
    sqlite.close();
  });

  it('tolerates a single empty history below the failure threshold', async () => {
    const { repo, sqlite, runInTransaction } = setup();
    const r = await refreshUniverse({
      fetchNavList: async () => LIST,
      fetchHistory: async (c) => (c === '1003' ? [] : HISTORIES[c]),
      repo, runInTransaction, maxFailureRatio: 0.3,
    });
    expect(r.funds).toBe(4);
    sqlite.close();
  });
});

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once and preserves order', async () => {
    let active = 0, peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(peak).toBe(2);
    expect(out.map((o) => (o.status === 'fulfilled' ? o.value : null))).toEqual([2, 4, 6, 8, 10]);
  });
});
