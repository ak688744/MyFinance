import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makePerformanceUniverseRepo } from '../../src/repositories/performanceUniverseRepo';
import type { UniverseSnapshot } from '../../src/repositories/types';

const perf = (amfiCode: string, r3y: number) => ({
  amfiCode, asOf: '2026-08-31', benchmarkCode: '147623', r1y: 0.1, r3y, r5y: 0.15, r10y: null,
  vol3y: 0.18, maxDrawdown5y: -0.24, rolling3yBeatPct: 0.9, rolling3yMedianExcess: 0.02,
  upCapture3y: 1.05, downCapture3y: 0.8, categoryPctile3y: 0.5, categoryPctile5y: 0.6,
});

function snapshot(builtAt: string, codes: string[]): UniverseSnapshot {
  return {
    builtAt,
    asOf: '2026-08-31',
    funds: codes.map((c) => ({
      amfiCode: c, schemeName: `Fund ${c}`, amc: 'AMC', category: 'Equity: Small Cap',
      latestNav: 10, latestNavDate: '2026-09-29', historyStart: '2015-01-30', rankable: true, builtAt,
    })),
    monthlyNav: codes.flatMap((c) => [
      { amfiCode: c, monthEnd: '2026-07-31', nav: 9 },
      { amfiCode: c, monthEnd: '2026-08-29', nav: 10 },
    ]),
    performance: codes.map((c, i) => perf(c, 0.1 + i / 100)),
    categoryStats: [{ category: 'Equity: Small Cap', metric: 'r3y', p25: 0.1, median: 0.15, p75: 0.2, n: codes.length, asOf: '2026-08-31' }],
  };
}

describe('performanceUniverseRepo', () => {
  it('returns null meta before any build', () => {
    const { db, sqlite } = runMigrations(':memory:');
    expect(makePerformanceUniverseRepo(db).getMeta()).toBeNull();
    sqlite.close();
  });

  it('replaceAll stores a snapshot readable through every accessor', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makePerformanceUniverseRepo(db);
    repo.replaceAll(snapshot('2026-09-01T00:00:00.000Z', ['1', '2']));
    expect(repo.getMeta()).toEqual({ builtAt: '2026-09-01T00:00:00.000Z', asOf: '2026-08-31' });
    expect(repo.getFund('1')?.rankable).toBe(true);
    expect(repo.listFunds({ category: 'Equity: Small Cap' })).toHaveLength(2);
    expect(repo.getMonthlyNav('1').map((p) => p.date)).toEqual(['2026-07-31', '2026-08-29']);
    expect(repo.getPerformance(['2'])[0].r3y).toBeCloseTo(0.11);
    const byCat = repo.listPerformanceByCategory('Equity: Small Cap');
    expect(byCat.map((r) => r.schemeName).sort()).toEqual(['Fund 1', 'Fund 2']);
    expect(repo.getCategoryStats('Equity: Small Cap')[0].median).toBe(0.15);
    expect(repo.listCategories()).toEqual(['Equity: Small Cap']);
    sqlite.close();
  });

  it('replaceAll fully replaces the previous universe (no leftovers)', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makePerformanceUniverseRepo(db);
    repo.replaceAll(snapshot('2026-08-01T00:00:00.000Z', ['1', '2']));
    repo.replaceAll(snapshot('2026-09-01T00:00:00.000Z', ['3']));
    expect(repo.getFund('1')).toBeNull();
    expect(repo.getMonthlyNav('1')).toEqual([]);
    expect(repo.listFunds()).toHaveLength(1);
    expect(repo.getMeta()?.builtAt).toBe('2026-09-01T00:00:00.000Z');
    sqlite.close();
  });

  it('handles a large snapshot (chunked inserts)', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makePerformanceUniverseRepo(db);
    const codes = Array.from({ length: 1200 }, (_, i) => String(100000 + i));
    repo.replaceAll(snapshot('2026-09-01T00:00:00.000Z', codes));
    expect(repo.listFunds()).toHaveLength(1200);
    sqlite.close();
  });
});
